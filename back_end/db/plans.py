"""
Plan object for working with database and plan functions for API
"""
import binascii
import os
import time

from back_end.db import db, default_str_len
from back_end.db.plan_users import PlanUser
from back_end.exceptions import InvalidRequest, ResourceNotFound, InvalidContent, Unauthorized

# length needs to be even, otherwise will be rounded down
JOINID_LENGTH = 8


class Plan(db.Model):
    """
    Plan object that represents an entry in the 'Plans' table

    :param str name: name of plan
    :param Times times: represents times for plan time columns
    :param str ownerid: Google auth user ID of plan creator
    """
    __tablename__ = 'Plans'
    id = db.Column('id', db.Integer, primary_key=True)
    name = db.Column(db.String(default_str_len), nullable=False)
    event_vote_close_time = db.Column(db.Integer, nullable=False)
    route_vote_close_time = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.Integer, nullable=False)
    end_time = db.Column(db.Integer, nullable=False)
    joinid = db.Column(db.String(default_str_len), nullable=False)
    ownerid = db.Column(db.String(default_str_len), nullable=False)

    def __init__(self, name, times, ownerid):
        self.name = name
        self.ownerid = ownerid
        self.users.append(PlanUser(self.id, ownerid))
        self.joinid = binascii.hexlify(os.urandom(JOINID_LENGTH / 2))
        # Initialise time properties
        self.start_time = times.start_time
        self.event_vote_close_time = times.event_vote_close_time
        self.route_vote_close_time = times.route_vote_close_time
        self.end_time = times.end_time

    def check_user(self, userid):
        """
        Check if a user is allowed to access the plan

        :param str userid: Google auth user ID
        :return: True if user has joined the plan, False otherwise
        :rtype: bool
        """
        return userid in [u.userid for u in self.users]

    @property
    def timephase(self):
        """
        :return: the phase of the plan based on time
        :rtype: int
        """
        now = int(time.time())
        if now < self.event_vote_close_time:
            return 1
        if now < self.route_vote_close_time:
            return 2
        if now < self.end_time:
            return 3
        return 4

    @property
    def phase(self):
        """
        :return: the phase of the plan
        :rtype: int
        """
        # p = self.timephase
        # if p > 1 and len(self.events) == 0:
        #     return 4
        # if p > 2 and len(self.routes) == 0:
        #     return 4
        # return p
        return self.timephase

    @property
    def serialise(self):
        """
        Used to create a dictionary for jsonifying

        :return: dictionary representation of Plan object
        """
        result = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        result['phase'] = self.phase
        result['events_count_positive'] = self.events_count_positive
        result['routes_count_positive'] = self.routes_count_positive
        return result


class Times(object):
    # pylint: disable-msg=too-few-public-methods
    """
    Object to hold all the times needed to create a plan

    :param int start_time: plan creation time
    :param int event_vote_close_time: end of creating and voting on events phase
    :param int route_vote_close_time: end of creating and voting on routes phase
    :param int end_time: expiration of plan
    """

    def __init__(self, start_time, event_vote_close_time, route_vote_close_time, end_time):
        self.start_time = start_time
        self.event_vote_close_time = event_vote_close_time
        self.route_vote_close_time = route_vote_close_time
        self.end_time = end_time


def get_from_id(planid, userid):
    """
    test
    :param planid:
    :param userid:
    :return:
    """
    if planid is None:
        raise InvalidRequest('Plan id not specified')
    if not str(planid).isdigit():
        raise InvalidRequest("Plan id '{}' is not a valid id".format(planid))
    plan = Plan.query.get(planid)
    if plan is None:
        raise ResourceNotFound("Plan not found for id '{}'".format(planid))
    if not plan.check_user(userid):
        raise Unauthorized("User not authorized for Plan '{}'".format(planid))
    return plan


def create(name, event_vote_close_time, route_vote_close_time, end_time, userid):
    """
    Create a plan object with input validation and commit the object to the database
    """
    if name is None or not name:
        # name is not in json or is the empty string
        raise InvalidContent("Plan name is not specified")
    if event_vote_close_time is None:
        raise InvalidContent("Plan eventVoteCloseTime is not specified")
    if not str(event_vote_close_time).isdigit():
        raise InvalidContent("Plan eventVoteCloseTime is not an integer")
    if route_vote_close_time is None:
        raise InvalidContent("Plan routeVoteCloseTime is not specified")
    if not str(route_vote_close_time).isdigit():
        raise InvalidContent("Plan routeVoteCloseTime is not an integer")
    if end_time is None or not str(end_time).isdigit():
        raise InvalidContent("Plan endTime is not specified")

    start_time = int(time.time())

    # This check may cause errors if the time of receiving request is
    # significantly later than time of checks in JS
    if not start_time <= event_vote_close_time:
        raise InvalidContent("eventVoteCloseTime is before startTime")
    if not event_vote_close_time <= route_vote_close_time:
        raise InvalidContent("routeVoteCloseTime is before eventVoteCloseTime")
    if not route_vote_close_time <= end_time:
        raise InvalidContent("endTime is before eventVoteCloseTime")

    times = Times(start_time, event_vote_close_time, route_vote_close_time, event_vote_close_time)

    new_plan = Plan(name, times, userid)

    db.session.add(new_plan)
    db.session.commit()
    return new_plan


def get_events_from_id(planid, userid):
    """
    Get a list of Event objects associated with a plan, each with the user's current vote
    """
    events = get_from_id(planid, userid).events
    for event in events:
        event.userVoteState = event.get_vote(userid)
    return events


def get_routes_from_id(planid, userid):
    """
    Get a list of Route objects associated with a plan, each with the user's current vote
    """
    plan = get_from_id(planid, userid)
    routes = plan.routes
    for route in routes:
        route.userVoteState = route.get_vote(userid)
    return routes


def add_user(joinid, userid):
    """
    Add a user to a plan, using the shared join hash code
    """
    plans = Plan.query.filter_by(joinid=joinid).all()
    if plans is None or len(plans) < 1:
        raise ResourceNotFound("Cannot find Plan for joinid '{}'".format(joinid))
    # Super unlikely that the same join code is generated for 2 plans
    plan = plans[0]
    if userid not in [pu.userid for pu in plan.users]:
        plan.users.append(PlanUser(plan.id, userid))
        db.session.commit()
    return plan

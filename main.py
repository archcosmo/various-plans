# [START imports]
import logging
from flask import Flask, render_template, request, redirect, url_for
from forms import PlanForm, EventForm, RouteForm
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import config

app = Flask(__name__)
app.config.from_object(config)
# 'mysql+mysqldb://root@/<dbname>?unix_socket=/cloudsql/<projectid>:<instancename>'
app.debug = True

db = SQLAlchemy(app)


class Plan(db.Model):
    __tablename__ = 'Plans'
    id = db.Column('id', db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phase = db.Column(db.Integer, nullable=False)
    startDate = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    endDate = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, name, phase):
        self.name = name
        self.phase = phase


class Event(db.Model):
    __tablename__ = 'Events'
    id = db.Column('id', db.Integer, primary_key=True)
    planid = db.Column(db.Integer, db.ForeignKey('Plans.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(100))
    votes = db.Column(db.Integer, nullable=False, default=0)

    plan = db.relationship('Plan', backref=db.backref('events', lazy=True))

    def __init__(self, name, location):
        self.name = name
        self.location = location
        self.votes = 0

    def vote(self, vote):
        self.votes = self.votes + vote


class Route(db.Model):
    __tablename__ = 'Routes'
    id = db.Column('id', db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    planid = db.Column(db.Integer, db.ForeignKey('Plans.id'), nullable=False)
    votes = db.Column(db.Integer, nullable=False, default=0)

    plan = db.relationship('Plan', backref=db.backref('routes', lazy=True))
    events = db.relationship("Event", secondary='route_event')

    def __init__(self, name):
        self.name = name
        self.votes = 0

    def vote(self, vote):
        self.votes = self.votes + vote

    def assignEvents(self, eventids):
        for i, eventid in enumerate(eventids):
            db.session.add(RouteEvent(self.id, eventid, i))


class RouteEvent(db.Model):
    __tablename__ = 'route_event'
    routeid = db.Column(db.Integer, db.ForeignKey('Routes.id'), primary_key=True)
    eventid = db.Column(db.Integer, db.ForeignKey('Events.id'), primary_key=True)
    index = db.Column(db.Integer, primary_key=True, nullable=False)

    # events = db.relationship('Event', backref=db.backref('event', lazy=True))
    def __init__(self, routeid, eventid, index):
        self.routeid = routeid
        self.eventid = eventid
        self.index = index


db.create_all()


# [homepage]
@app.route('/', methods=['GET'])
@app.route('/index', methods=['GET'])
def index():
    return render_template('index.html')


# [plan view]
@app.route('/plan/<planid>', methods=['GET'])
def disp_plan(planid):
    # cant we redirect as well, to allow refreshes
    plan = Plan.query.get(planid)
    return render_template('plan.html', plan=plan)


# [new plan]
@app.route('/plan/new', methods=['POST', 'GET'])
def new_plan():
    if (request.method == "GET"):
        form = PlanForm()
        return render_template('new_plan.html', form=form)
    elif (request.method == 'POST'):
        # create new plan in db
        newPlan = Plan(request.form['name'], 1)

        db.session.add(newPlan)
        db.session.commit()
        return redirect(url_for('disp_plan', planid=newPlan.id))


# [new event]
@app.route('/plan/<planid>/event/new', methods=['POST', 'GET'])
def new_event(planid):
    if (request.method == "GET"):
        form = EventForm()
        return render_template('new_event.html', form=form, plan=Plan.query.get(planid))
    elif (request.method == 'POST'):

        e = Event(request.form['name'], request.form['location'])
        plan = Plan.query.get(planid)
        plan.events.append(e)
        db.session.commit()
        return redirect(url_for('disp_plan', planid=plan.id))


# [new route]
@app.route('/plan/<planid>/route/new', methods=['POST', 'GET'])
def new_route(planid):
    if (request.method == "GET"):
        form = RouteForm()
        return render_template('new_route.html', form=form, plan=Plan.query.get(planid))
    elif (request.method == 'POST'):

        plan = Plan.query.get(planid)
        # TODO check the phase!!

        r = Route(request.form['name'])
        plan.routes.append(r)
        db.session.commit()

        # TODO check events are in the plan!!
        r.assignEvents(list(map(int, request.form['eventids'].split(','))))
        db.session.commit()

        return redirect(url_for('disp_plan', planid=plan.id))


# [count votes]
@app.route('/plan/<planid>/countvotes', methods=['POST'])
def countvotes(planid):
    plan = Plan.query.get(planid)
    plan.phase = plan.phase + 1
    db.session.commit()
    return redirect(url_for('disp_plan', planid=plan.id))


# [vote]
@app.route('/event/<eventid>/upvote', methods=['POST'])
def upvote_event(eventid):
    return vote_event(eventid, 1)


@app.route('/event/<eventid>/downvote', methods=['POST'])
def downvote_event(eventid):
    return vote_event(eventid, -1)


def vote_event(eventid, vote):
    # TODO check plan is in phase 1
    event = Event.query.get(eventid)
    event.vote(vote)
    db.session.commit()
    return redirect(url_for('disp_plan', planid=event.planid))


@app.route('/route/<routeid>/upvote', methods=['POST'])
def upvote_route(routeid):
    return vote_route(routeid, 1)


@app.route('/route/<routeid>/downvote', methods=['POST'])
def downvote_route(routeid):
    return vote_route(routeid, -1)


def vote_route(routeid, vote):
    # todo check plan is in phase 2
    route = Route.query.get(routeid)
    route.vote(vote)
    db.session.commit()
    return redirect(url_for('disp_plan', planid=route.planid))


@app.errorhandler(500)
def server_error(e):
    # Log the error and stacktrace.
    logging.exception('An error occurred during a request.')
    return 'An internal error occurred.', 500


if __name__ == '__main__':
    app.run()

import time
from functools import wraps

from flask import jsonify, make_response, request
from google.auth.transport import requests
from google.oauth2 import id_token

from back_end.exceptions import Unauthorized

debug = False


def init(app, prefix):
    global debug
    import plans
    import events
    import routes
    import users
    import token
    debug = app.debug
    app.register_blueprint(plans.ROUTES, url_prefix='{}/plan'.format(prefix))
    app.register_blueprint(events.ROUTES, url_prefix='{}/event'.format(prefix))
    app.register_blueprint(routes.ROUTES, url_prefix='{}/route'.format(prefix))
    app.register_blueprint(users.ROUTES, url_prefix='{}/user'.format(prefix))
    # TODO get rid of this and token.py
    app.register_blueprint(token.ROUTES, url_prefix='{}/token'.format(prefix))


def get_userid_from_token(token):
    try:
        idinfo = id_token.verify_oauth2_token(token, requests.Request(),
                                              "952476275187-ef3icj10cn4ptsl3ehs3jcg3tdeff0pv.apps.googleusercontent.com"
                                              )

        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')

        # If auth request is from a G Suite domain:
        # if idinfo['hd'] != GSUITE_DOMAIN_NAME:
        #     raise ValueError('Wrong hosted domain.')

        # ID token is valid. Get the user's Google Account ID from the decoded token.
        return idinfo['sub']

        # print('userid: {}'.format(idinfo['sub']), file=sys.stderr)
        # print('user name: {}'.format(idinfo['name']), file=sys.stderr)
    except ValueError:
        raise Unauthorized('Please log in')


def token_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = request.cookies.get('vp-token')
        if token is not None:
            userid = get_userid_from_token(token)
            kwargs['userid'] = userid
            return func(*args, **kwargs)
        raise Unauthorized('Please log in')
        #raise Unauthorized('No token in cookies')

    return wrapper


def jsonify_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        timestamp = time.time()
        json = kwargs.pop('json', True)
        obj, status_code = func(*args, **kwargs)
        if json:
            if isinstance(obj, list):
                d = dict()
                d['results'] = [i.serialise for i in obj]
                obj = d
            else:
                obj = obj.serialise
            obj['timestamp'] = timestamp
            return make_response(jsonify(obj), status_code)
        return obj

    return wrapper

# Copyright 2016 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# [START app]
import logging

# [START imports]
from flask import Flask, render_template, request
from forms import PlanForm
import database_handler as db

# [END imports]

# [START create_app]
app = Flask(__name__)
app.secret_key = 'development key lol'


# [END create_app]

# [START homepage]
@app.route('/', methods=['GET'])
@app.route('/index', methods=['GET'])
def index():
    return render_template('index.html')


# [END homepage]

# [START plan view]
@app.route('/plan/<planid>', methods=['GET'])
def plan(planid):
    # get plan form db or smth
    plan = {'id': planid, 'name': 'CS BNO', 'phase': 2, 'chosenRoute': None}
    # get events
    events = [{'name': 'Staags', 'votes': 3}, {'name': 'Mitre', 'votes': -2}, {'name': 'Sobar', 'votes': 5},
              {'name': 'manzils', 'votes': 4}]
    # get routes
    routes = [{'name': 'Route 1', 'votes': 6}, {'name': 'Route 2', 'votes': -4}, {'name': 'Route 3', 'votes': 3},
              {'name': 'Route 4', 'votes': 1}]

    plan['events'] = events
    plan['routes'] = routes

    return render_template('plan.html', plan=plan)


# [END plan view]

# [START newplan]
@app.route('/plan/new', methods=['POST', 'GET'])
def new_plan():
    if (request.method == "GET"):
        form = PlanForm()
        return render_template('new_plan.html', form=form)
    elif (request.method == 'POST'):

        # create new plan in db
        db.reset()
        # planid = db.createPlan(request.form)
        return plan(1)


# [END new plan]


@app.errorhandler(500)
def server_error(e):
    # Log the error and stacktrace.
    logging.exception('An error occurred during a request.')
    return 'An internal error occurred.', 500
# [END app]

var redirectToMain = function() { window.location = "/"; };

var hasMapsLoaded = false, hasGAPILoaded = false;

function mapsLoaded() {
    //Called when google maps api has loaded
    hasMapsLoaded = true;
    if(hasMapsLoaded && hasGAPILoaded) {
      //Initialise the local session
      localSession.initialise();
    }
}

function gapiLoaded() {
    //Called when Google login API has loaded
    hasGAPILoaded = true;
    if(hasMapsLoaded && hasGAPILoaded) {
      //Initialise the local session
      localSession.initialise();
    }
}

function signedIn() {
  //Show profile in navbar
  var userProfile = gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
  $("#name").html("<strong>" + userProfile.getGivenName() + "</strong><i class=\"glyphicon glyphicon-user\"></i>");
  $("#email").html(userProfile.getEmail());
}

googleLoginListeners.onNotSignedIn.push(redirectToMain);
googleLoginListeners.onSignOut.push(redirectToMain);
googleLoginListeners.onSignIn.push(signedIn);
googleLoginListeners.onLoad.push(gapiLoaded);

//Reposition map to show all given events
function fitEventsOnMap(eventList) {
    //Show all markers on map
    var bounds = new google.maps.LatLngBounds();
    var validEvents = 0;
    eventList.forEach(function(event) {
      //Check that event is Event and not placeholder "pending"
      if(event && event.place) {
        validEvents++;
        //Viewport looks better when the map is fitted to single place with a view port
        //When fitted to multiple points, location looks better
        if (event.place.geometry.viewport && Object.keys(eventList).length === 1) {
          // Only geocodes have viewport.
          bounds.union(event.place.geometry.viewport);
        } else {
          bounds.extend(event.place.geometry.location);
        }
      }
    });

    if(validEvents === 0) {
      //Fit map to location so it doesn't end up in pacific ocean
      // Try HTML5 geolocation.
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
          var pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };

          localSession.map.setCenter(pos);
        }, function() {
          handleLocationError(true, infoWindow, map.getCenter());
        });
      } else {
        // If browser does not support location, set position to england
        var pos_default = {
          //Center on england
          lat: 54.73413609763893,
          lng: -3.3233642578125
        };
        localSession.map.setCenter(pos_default);
      }
    } else {
      localSession.map.fitBounds(bounds);
    }
}

function removeMarkersFromMap(markers) {
    //Remove markers from map
    markers.forEach(function(marker) {
        marker.setMap(null);
    });
}

function addMarkerToMap(place) {
    var icon = {
        url: '../../static/assets/img/mappin-small.png',
        size: new google.maps.Size(71, 71),
        origin: new google.maps.Point(0, 0),
        anchor: new google.maps.Point(17, 20),
        scaledSize: new google.maps.Size(25, 25)
    };

    // Create a marker for each place.
    return new google.maps.Marker({
        map: localSession.map,
        icon: icon,
        title: place.name,
        animation: google.maps.Animation.DROP,
        place: {
            location: place.geometry.location,
            placeId: place.place_id
        }
    });
}

function isPlaceAdded(placeId) {
    var placeAdded = false;
    localSession.events.forEach(function(event) {
        if(event.place.place_id === placeId) {
            placeAdded = true;
            return false; //Break from forEach loop
        }
    });
    return placeAdded;
}

function displayEventInfo(event) {
    localSession.sidebarMenuIndex++;
    var submenu = "#sidebar-sub" + localSession.sidebarMenuIndex;
    $(submenu).find(".menu-heading").html("Event Info");
    $(submenu).find(".menu-content").empty();
    $(submenu).find(".menu-content")
        .append($("<span>", {text: "Name: " + event.name})).append("<br>")
        .append($("<span>", {text: "Current Votes: " + String(event.votes)})).append("<br>")
        .append($("<span>", {text: "Venue: " + event.place.name})).append("<br>")
        .append($("<span>", {text: "Address: " + event.place.formatted_address})).append("<br>");

    //Add photo gallery if there are photos
    if(event.place.photos !== undefined && event.place.photos.length > 0) {
        new PhotoGallery(event.place.photos, Math.floor($(submenu).width() * 0.8)).render($(submenu).find(".menu-content"));
    }

    $(submenu).find(".prev-menu-button").off("click").click(function() {
        localSession.sidebarMenuIndex--;
        event.marker.setAnimation(null); //Stop Bouncing
        openMenu(localSession.sidebarMenuIndex);
        fitEventsOnMap(localSession.events);
    });
    openMenu(localSession.sidebarMenuIndex);
}

function displayRouteInfo(route) {
    localSession.sidebarMenuIndex++;

    //Work out total walking duration
    var duration = 0;
    route.direction.routes[0].legs.forEach(function(leg) { duration += leg.duration.value; });

    var submenu = "#sidebar-sub" + localSession.sidebarMenuIndex;
    $(submenu).find(".menu-heading").html("Route Info");
    $(submenu).find(".menu-content").empty();
    $(submenu).find(".menu-content")
        .append($("<span>", {text: "Name: " + route.name})).append("<br>")
        .append($("<span>", {text: "Current Votes: " + String(route.votes)})).append("<br>")
        .append($("<span>", {text: "Estimated Route Walking Time: " + millistoReadable(duration*1000)})).append("<br>")
        .append($("<span>", {text: "Stops"})).append("<br>");

    //Add each event to info page
    route.getIncludedEvents().forEach(function(route) {
        route.displayUI($(submenu).find(".menu-content"), false);
    });

    //Give back button functionality
    $(submenu).find(".prev-menu-button").off("click").click(function() {
        localSession.sidebarMenuIndex--;
        openMenu(localSession.sidebarMenuIndex);
        //Make all route lines and markers visible again
        localSession.routes.forEach(function(route) {
          if(route !== "invalid") {
            route.setVisibleOnMap(true);
          }
        });
        localSession.events.forEach(function(event) {
            event.setVisibleOnMap(true);
        });
        fitEventsOnMap(localSession.events);
    });
    openMenu(localSession.sidebarMenuIndex);
}

//Moves menus to given level - 0 is base menu
function openMenu(level) {
    $(".sidebar-menu").stop().animate({ left: "-" + (($(".sidebar-menu").width() + 20) * level) });
}

//POLLING
function updateTimeDiv(millis){
    var days, hours, mins, secs;
    secs = Math.floor(millis / 1000);
    mins = Math.floor(secs / 60);
    secs = secs % 60;
    hours = Math.floor(mins / 60);
    mins = mins % 60;
    days = Math.floor(hours / 24);
    hours = hours % 24;

    $("#time-div").find(".number-seconds").html(secs);
    $("#time-div").find(".number-minutes").html(mins);
    $("#time-div").find(".number-hours").html(hours);
    $("#time-div").find(".number-days").html(days);
}

function millistoReadable(millis) {
    var days, hours, mins, secs, readable = "";
    secs = Math.floor(millis / 1000);
    mins = Math.floor(secs / 60);
    secs = secs % 60;
    hours = Math.floor(mins / 60);
    mins = mins % 60;
    days = Math.floor(hours / 24);
    hours = hours % 24;

    if(days > 0)
      readable += days + " days, ";
    if(hours > 0)
      readable += hours + " hours, ";
    if(mins > 0)
      readable += mins + " mins, ";
    if(secs > 0)
      readable += secs + " secs, ";
    return readable;
}

function pollServer() {
    //Get current phase that session is in
    var phase = localSession.getPhase();

    //Update countdown timer
    var timeRemaining = localSession.timeToPhaseEnd();
    if(timeRemaining > -1) {
        updateTimeDiv(timeRemaining*1000);
    } else {
        $("#time-div").css("display", "none");
    }

    if(phase == 1) {
        //Event voting phase, update events
        updateEventOrRoute(true, true, true).then(null, function(error_obj) {
          console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
          //No Errors Intended for Users Here...
        });
    } else if(phase == 2) {
        //Route voting phase
        if(localSession.lastCheckedPhase != 2) {
            //Show Loading div
            $("#loading-div-wrapper").fadeIn();
            localSession.enterPhase2();
        }
        //Update Routes
        updateEventOrRoute(true, true, false).then(null, function(error_obj) {
          console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
          //No Errors Intended for Users Here...
        });
    } else if (phase == 3) {
        //Final route phase
        if(localSession.lastCheckedPhase != 3) {
            //Show Loading div
            $("#loading-div-wrapper").fadeIn();
            localSession.enterPhase3();
        }
        //additional updates go here
    }
}

//Updates the events or routes tracked locally by polling backend API
//Optionally display new events or routes in map and sidebar
function updateEventOrRoute(displayNewEntries, displayOnMap, isEvents) {
  var apiCall = isEvents ? api.plan.getEvents : api.plan.getRoutes;
  var localList = isEvents ? localSession.events : localSession.routes;
  var EntryFactory = isEvents ? Event.EventFactory : Route.RouteFactory;
  var sideBarContainer = isEvents ? "#sidebar-menu .menu-content" : "#sidebar-menu #route-list";

  return new Promise(function(updateSuccess, updateError) {
    apiCall(localSession.plan.id).then(function(response) {
      var serverResponse = response.results;
      var promises = [];
      serverResponse.forEach(function(r) {
        var localResult = localList[r.id];
        //If entry is new to client
        if(localResult === undefined) {
          //Lock array element to prevent multiple async calls to this function creating duplicate objects
          localList[r.id] = "pending";
          //Create new object
          var promise = EntryFactory(r, null);
          promises.push(promise);
          promise.then(function(entry) {
            //Set latest server timestamp
            entry.timestamp = response.timestamp;
            //Add to event list
            localList[entry.id] = entry;
            if(displayNewEntries) {
              //Display entry with vote controls
              entry.displayUI($(sideBarContainer), true);
            }
            if(displayOnMap) {
              //Display event
              entry.displayOnMap();
            }
          }, function(error_status) {
            var eventRoute = isEvents ? "event" : "route";
            console.error("Error in creating " + eventRoute + ": " + error_status);
            if(error_status === "ZERO_RESULTS") {
              //Invalidate Entry
              localList[r.id] = "invalid";
            }
            else {
              //Reset local list
              localList[r.id] = undefined;
            }
          });
        } else if(localResult === "pending" || localResult === "invalid") {
          //Do nothing, it is being handled by other call, or is just an invalid object stored in the backend which should be ignored.
        } else {
          //Otherwise update event object as it exists
          //Only update if this is the latest response from the server
          if(localResult.timestamp === undefined || localResult.timestamp < response.timestamp) {
            Object.assign(localResult, r);
            localResult.timestamp = response.timestamp;
            //Refresh UI
            localResult.refreshUI();
          }
        }
      });
      Promise.all(promises).then(updateSuccess, updateError);
    },
    function(error_obj){
      updateError(error_obj);
    });
  });
}

function copyToClipboard(string) {
  var dummy = $("<input>", {"value" : string}).appendTo($(document.body));
  dummy.select();
  document.execCommand("Copy");
  document.body.removeChild(dummy[0]);
}

//Local Session object
var localSession = {
    //The events and routes that the client browser is tracking
    events: [],
    routes: [],
    //List of markers shown on map for search results
    searchmarkers: [],
    sidebarMenuIndex: 0,
    //The plan object representing this plan session
    plan: {id: 0},
    /*Returns an integer indicating the phase of this plan session
     * 0: Voting on /Adding Events
     * 1: Voting on /Adding Routes
     * 2: Displaying final Route
     */
    lastCheckedPhase: 1,
    getPhase: function() {
        var currTime = Math.floor((new Date()).getTime() / 1000);
        if(currTime > this.plan.routeVoteCloseTime)
            return 3;
        if(currTime > this.plan.eventVoteCloseTime)
            return 2;
        return 1;
    },
    timeToPhaseEnd: function() {
        var currTime = Math.floor((new Date()).getTime() / 1000);
        if(currTime <= this.plan.eventVoteCloseTime)
            return this.plan.eventVoteCloseTime - currTime;
        if(currTime <= this.plan.routeVoteCloseTime)
            return this.plan.routeVoteCloseTime - currTime;
        return -1;
    },
    enterPhase2: function() {
        this.lastCheckedPhase = 2;
        console.log("Entered Phase 2");
        //Update UI
        $("#time-div-title").html("Route Voting Ends In"); //Change Countdown Timer Heading
        $("#sidebar-menu").find(".menu-heading").html("Decide Routes"); //Change Heading
        $("#sidebar-menu").find(".menu-content").empty(); //Clear voting controls for events
        $("#map-search").css("display", "none"); //Search no longer needed
        $("#modal-place").modal("hide"); //Hide place modal if open
        removeMarkersFromMap(this.searchmarkers); //Clear any search markers from map
        localSession.searchmarkers = [];

        $("<div>", { "id" : "route-list" }).appendTo($("#sidebar-menu").find(".menu-content"));

        //Reset Available events
        this.events.forEach(function(event) {
            event.marker.setMap(null);
        });
        this.events = [];

        //Add new events to map, but not sidebar
        return updateEventOrRoute(false, true, true).then(function() {

            //Hide Loading div
            $("#loading-div-wrapper").fadeOut();

            //Count up valid events
            var noEvents = 0;
            localSession.events.forEach(function(event) {
              if(event !== "invalid" && event !== "pending") {
                noEvents++;
              }
            });

            if(noEvents === 0) {
              //No Events agreed upon
              popupModal.show("Plan Expired", "No preffered locations could be selected for this plan.").then(function() {
                window.location = "/";
              });
            } else {
              fitEventsOnMap(localSession.events);

              $("<button>", {"id": "add-route-button", "class": "btn btn-primary", "type": "button", text: "Add Route"})
              .appendTo($("#sidebar-menu").find(".menu-content"))
              .click(function() {
                $("#modal-route").modal("show");
              });
            }
        }, function(error_obj) {
          //Hide Loading div
          $("#loading-div-wrapper").fadeOut();
          console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
          //No Errors Intended for Users Here...
        });
    },
    enterPhase3: function() {
        this.lastCheckedPhase = 3;
        console.log("Entered Phase 3");
        //Clear UI
        $("#map-search").css("display", "none"); //Search no longer needed
        $("#modal-place").modal("hide"); //Hide place modal if open
        $("#modal-route").modal("hide"); //Hide route modal if open
        removeMarkersFromMap(this.searchmarkers); //Clear any search markers from map
        localSession.searchmarkers = [];

        //Update UI
        $("#sidebar-menu").find(".menu-heading").html("Final Route");
        $("#sidebar-menu").find(".menu-content").empty();
        $("#time-div").css("display", "none");

        //Reset Available events
        this.events.forEach(function(event) {
            event.marker.setMap(null);
        });
        this.events = [];

        //Reset Available routes
        this.routes.forEach(function(route) {
            route.directionsRenderer.setMap(null);
        });
        this.routes = [];

        //Add new events to map, but not sidebar
        //In phase 3 /api/plan/<id>/events returns only the events in the winning route
        return updateEventOrRoute(false, true, true).then(function() {
            fitEventsOnMap(localSession.events);

            updateEventOrRoute(false, true, false).then(function(routes) {
                //Hide Loading div
                $("#loading-div-wrapper").fadeOut();

                //Count up valid events
                var noRoutes = 0;
                localSession.routes.forEach(function(route) {
                  if(route !== "invalid" && route !== "pending") {
                    noRoutes++;
                  }
                });

                if(noRoutes === 0) {
                  //No Events agreed upon
                  popupModal.show("Plan Expired", "No routes were added to this plan.").then(function() {
                    window.location = "/";
                  });
                } else {
                  fitEventsOnMap(localSession.events);
                  //In phase 3, /api/plan/<id>/routes returns singleton containing winning routes
                  var route = routes[0];
                  var duration = 0;
                  route.direction.routes[0].legs.forEach(function(leg) { duration += leg.duration.value; });
                  $("#sidebar-menu").find(".menu-content")
                    .append($("<span>", {text: "Name: " + route.name})).append("<br>")
                    .append($("<span>", {text: "Votes: " + String(route.votes)})).append("<br>")
                    .append($("<span>", {text: "Estimated Route Walking Time: " + millistoReadable(duration*1000)})).append("<br>")
                    .append($("<span>", {text: "Stops"})).append("<br>");

                //Add each event to info page
                route.getIncludedEvents().forEach(function(route) {
                    route.displayUI($("#sidebar-menu").find(".menu-content"), false);
                });
              }
            }, function(error_obj) {
              //Hide Loading div
              $("#loading-div-wrapper").fadeOut();
              console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
              //No Errors Intended for Users Here...
            });
        }, function(error_obj) {
          //Hide Loading div
          $("#loading-div-wrapper").fadeOut();
          console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
          //No Errors Intended for Users Here...
        });
    },

    initialise: function() {
        //Initialise GMaps API
        this.initGMaps();
        //Initialise Session Variables
        var sessionInitPromise = this.initSessionVars();
        //Initialise UI
        this.initUI();
        //Init Polling
        sessionInitPromise.then(function() {
          setInterval(pollServer, 1000);
        });
    },
    initSessionVars: function(){
        //Poll server for initial plan information
        this.plan = _apiLoad.plan;
        this.lastCheckedPhase = this.plan.phase;

        switch(this.getPhase()) {
            case 1:
                //Add new events and reposition map
                return updateEventOrRoute(true, true, true).then(function() {
                    //Hide Loading div
                    $("#loading-div-wrapper").fadeOut();
                    fitEventsOnMap(localSession.events);
                }, function(error_obj) {
                  //Hide Loading div
                  $("#loading-div-wrapper").fadeOut();
                  console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
                  //No Errors Intended for Users Here...
                });
            case 2:
                return this.enterPhase2();
            case 3:
                return this.enterPhase3();
        }
    },
    initGMaps: function() {
        var map = this.map = new google.maps.Map($("#map")[0], {
            zoom: 6,
            center: {lat: 54.73413609763893, lng: -3.3233642578125}
        });
        var placesService = this.placesService = new google.maps.places.PlacesService(map);
        this.directionsService = new google.maps.DirectionsService();

        var input = $("#map-search")[0];
        var searchBox = new google.maps.places.SearchBox(input);
        map.controls[google.maps.ControlPosition.TOP_LEFT].push(input);

        // Bias the SearchBox results towards current map's viewport.
        map.addListener('bounds_changed', function() {
            searchBox.setBounds(map.getBounds());
        });

        // Listen for the event fired when the user selects a prediction and retrieve
        // more details for that place.
        searchBox.addListener('places_changed', function() {
            var places = searchBox.getPlaces();

            if (places.length == 0) {
                return;
            }

            // Clear out the old markers.
            localSession.searchmarkers.forEach(function(marker) {
                marker.setMap(null);
            });
            localSession.searchmarkers = [];

            // For each place, get the icon, name and location.
            var bounds = new google.maps.LatLngBounds();
            //Track places returned not already added
            var validPlacesReturned = 0;
            places.forEach(function(place) {
                if(isPlaceAdded(place.place_id)){
                    //Place already added so skip to next iteration
                    return true;
                }
                validPlacesReturned++;

                if (!place.geometry) {
                    console.log("Returned place contains no geometry");
                    return;
                }
                var icon = {
                    url: place.icon,
                    size: new google.maps.Size(71, 71),
                    origin: new google.maps.Point(0, 0),
                    anchor: new google.maps.Point(17, 34),
                    scaledSize: new google.maps.Size(25, 25)
                };

                // Create a marker for each place.
                var marker = new google.maps.Marker({
                    map: map,
                    icon: icon,
                    title: place.name,
                    place: {
                        location: place.geometry.location,
                        placeId: place.place_id
                    }
                });

                marker.addListener('mouseover', function() {
                    if(localSession.getPhase() === 1) {
                        var markerIco = this.getIcon();
                        markerIco.scaledSize = new google.maps.Size(41, 41);
                        markerIco.anchor = new google.maps.Point(markerIco.anchor.x+8,markerIco.anchor.y+8);
                        marker.setIcon(markerIco);
                    }
                });

                marker.addListener('mouseout', function() {
                    if(localSession.getPhase() === 1) {
                        var markerIco = this.getIcon();
                        markerIco.scaledSize = new google.maps.Size(25, 25);
                        markerIco.anchor = new google.maps.Point(markerIco.anchor.x-8, markerIco.anchor.y-8);
                        marker.setIcon(markerIco);
                    }
                });

                marker.addListener('click', function() {
                    if(localSession.getPhase() === 1) {
                        placesService.getDetails({placeId: this.getPlace().placeId}, function(place, status) {
                            if (status === google.maps.places.PlacesServiceStatus.OK) {
                                $("#modal-place").data("place", place).modal('show');
                            }
                        });
                    }
                });

                localSession.searchmarkers.push(marker);

                if (place.geometry.viewport) {
                    // Only geocodes have viewport.
                    bounds.union(place.geometry.viewport);
                } else {
                    bounds.extend(place.geometry.location);
                }
            });

            //If no places returned then fit map to current results
            //Or the users location if no current results
            if(validPlacesReturned === 0)
              fitEventsOnMap(localSession.events);
            else
              map.fitBounds(bounds);
        });
    },
    initUI: function() {
        //Set Main Page Height
        var fixHeight = function() {
          $("#display-row").height($(window).height() - $("#header").height() - 16);

          $("#places-list").css("max-height", ($("#map").height() - $("#time-div").height() - $("#sidebar-menu").find(".menu-heading").height() - 50));


          $("#sidebar-sub1").find(".menu-content").css("max-height", ($("#map").height() - $("#time-div").height() - $("#sidebar-sub1").find(".menu-heading").height() - 76));
          $("#sidebar-sub2").find(".menu-content").css("max-height", ($("#map").height() - $("#time-div").height() - $("#sidebar-sub2").find(".menu-heading").height() - 76));

          if($(window).width() <= 767) {
            $("#places-list").css("max-height", "");
            $("#sidebar-sub1").find(".menu-content").css("max-height", "");
            $("#sidebar-sub2").find(".menu-content").css("max-height", "");
          }
        };

        //Adjust Heights to fit page whenever resized
        $(window).resize(fixHeight);
        //Adjust for initial load
        fixHeight();

        //To avoid sidebar submenus from break, reset the sidebar menu position whenever resized
        $(window).resize(function() {
          openMenu(localSession.sidebarMenuIndex);
        });

        $("#sign-out").click(function() {
          gapi.auth2.getAuthInstance().signOut();
        });

        $("#join-id-button").click(function() {
          copyToClipboard(localSession.plan.joinid);
          popupModal.show("", "Join ID copied to clipboard.");
        });

        $("#modal-place").on('show.bs.modal', function (event) {
            var modal = $(this);
            modal.find(".error-message").hide();
            modal.find("#event-name").val("");
            var place = modal.data("place");
            modal.find("#place-details").html("Suggest " + place.name + " as an event?");
            modal.find("#add-place").off("click").click(function() {
                var inputName = $("#modal-place").find("#event-name").val();
                if(inputName.length === 0) {
                    $("#modal-place").find(".error-message").html("Please enter a name.");
                    $("#modal-place").find(".error-message").hide().fadeIn();
                } else if(inputName.length >= 100) {
                    $("#modal-place").find(".error-message").html("Name too long.");
                    $("#modal-place").find(".error-message").hide().fadeIn();
                  } else {
                    //Remove the markers for the other search results
                    removeMarkersFromMap(localSession.searchmarkers);
                    localSession.searchmarkers = [];
                    //Clear Search Box Text Content
                    $("#map-search").val("");
                    //Notify server of event creation
                    api.event.create(inputName, localSession.plan.id, place.place_id).then(function(response) {
                      //Create event from server response
                      Event.EventFactory(response, place).then(function(event) {
                        //Track event in session
                        localSession.events[event.id] = event;
                        //Render event
                        event.display();
                        //Reposition map
                        fitEventsOnMap(localSession.events);
                        modal.modal('hide');
                      }, function(status_code) {
                        popupModal.show("", "Google API responded with error: " + status_code);
                      });
                    },
                    function(error_obj) {
                      console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
                      $("#modal-place").find(".error-message").html(error_obj.message);
                      $("#modal-place").find(".error-message").hide().fadeIn();
                    });
                  }
            });
        });

        $(".route-sortable").sortable({connectWith: ".route-sortable", scroll: false}).css("cursor", "pointer");

        $("#modal-route").on('show.bs.modal', function (event) {
            $(this).find(".error-message").hide();
            $(this).find("#route-name").val("");
            //Clear lists
            $("#modal-route").find(".route-sortable").empty();
            //Repopulate list with available events
            localSession.events.forEach(function(event) {
                $("<li>", { text: event.name, "class": "ui-state-default card-ui" }).data("event-id", event.id).appendTo($("#modal-route").find(".available-event-list"));
            });
        });

        $("#modal-route").find("#add-route").click(function() {
            var inputName = $("#modal-route").find("#route-name").val();

            var routeEvents = $("#modal-route").find(".route-event-list").find("li");
            var eventList = [];
            for(var i = 0; i < routeEvents.length; i++) {
                eventList.push($(routeEvents[i]).data("event-id"));
            }

            if(inputName.length === 0) {
                $("#modal-route").find(".error-message").html("Please enter a name.");
                $("#modal-route").find(".error-message").hide().fadeIn();
            } else if(inputName.length >= 100) {
                $("#modal-route").find(".error-message").html("Name too long.");
                $("#modal-route").find(".error-message").hide().fadeIn();
            } else if(eventList.length === 0){
                $("#modal-route").find(".error-message").html("Please add events to the route.");
                $("#modal-route").find(".error-message").hide().fadeIn();
              } else {
                api.route.create($("#modal-route").find("#route-name").val(), localSession.plan.id, eventList).then(function(response) {

                  //Prevent polling duplicating the object
                  localSession.routes[response.id] = "pending";

                  //Create event from server response
                  Route.RouteFactory(response).then(function(route) {
                    //Track event in session
                    localSession.routes[route.id] = route;
                    route.display();
                    //TODO: Reposition map
                    $("#modal-route").modal('hide');
                  }, function(status_code) {
                    if(status_code === "ZERO_RESULTS") {
                      popupModal.show("", "It is not possible to walk this route.");
                    } else {
                      popupModal.show("", "Google API responded with error: " + status_code);
                    }
                  });
                }, function(error_obj) {
                  console.error("API ERROR CODE " + error_obj.status_code + ": " + error_obj.message);
                  $("#modal-route").find(".error-message").html(error_obj.message);
                  $("#modal-route").find(".error-message").hide().fadeIn();
                });
              }
        });
    }
};

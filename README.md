MetroGnome
==========
Bus tracking using MetroTransit's NexTrip API for the Pebble smartwatch.

Requires SDK v2.0

(C) 2014 Patrick Barrett - All Rights Reserved (For Now)

Development Status
==================
This software is currently beta quality and is not feature complete.

Currently only the "Find Me" feature is functional. "Find Me" locates your
position and gives you a list of nearby stops. Selecting one of those stops
then gives you a list of the next bus arrivals at that stop in real time.
Pressing select from any item in the arrival list will refresh the list.

To Do
-----
* Properly handle cases of no stops or no routes.
* Sort Stops by distance from user.
* Add option to auto-refresh stop times.
* Add funcion to track a bus and vibrate when it is due at stop.
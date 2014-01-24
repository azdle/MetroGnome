var geo_options = {
	enableHighAccuracy: false,
	maximumAge        : 30000,
	timeout           : 2000
};

var wpid,favorite_stops;

var lastGeo = {};

if (!String.prototype.trim) {
	String.prototype.trim = function () {
		return this.replace(/^\s+|\s+$/gm, '');
	};
}

function geo_success(position, callback) {
	console.log("GeoLocation Position: " + position.coords.latitude + "," + position.coords.longitude);
	lastGeo = LatLonDegToUTMXY(position.coords.latitude,position.coords.longitude, 15)
	console.log("X: " + lastGeo.x + " Y: " + lastGeo.y)

	if(callback !== undefined){
		callback(position)
	}
}

function geo_error() {
	console.log("GeoLocation Position not Available");
	Pebble.sendAppMessage({ "statusMessage": "Geolocation Not Available" });
}

function constructURIParameters(parameters){
	var encoded = ""
	for(i in parameters){
		encoded += fixedEncodeURIComponent(i) + "=" + fixedEncodeURIComponent(parameters[i]) + "&";
	}

	return encoded;
}

function fixedEncodeURIComponent (str) {
	return encodeURIComponent(str).replace(/[!'()]/g,escape).replace(/\*/g,"%2A");
}

function createEnvlopeString(x, y, delta){
	return JSON.stringify({xmin: x - delta,
	                      xmax: x + delta,
	                      ymin: y - delta,
	                      ymax: y + delta});
}

Pebble.addEventListener("ready",
	function(e) {
		console.log("MetroGnome Started");

		console.log("Starting GPS Watch Position");	

		if ("geolocation" in navigator) {
			wpid = navigator.geolocation.getCurrentPosition(geo_success,geo_error,geo_options);
		} else {
			console.log("Geolocation Not Availalbe");
			Pebble.sendAppMessage({ "statusMessage": "Geolocation Not Available" });
		}

		var favorites_stops_s = window.localStorage.getItem("favorite_stops");
		console.log("favorite_stops: " + favorites_stops_s)
		if(favorites_stops_s !== null){
			try{
				favorite_stops = JSON.parse(favorites_stops_s);
			}catch(e){
				favorite_stops = [];
			}
		}else{
			favorite_stops = [];
		}
	}
);

function fetchNearestStops(CoordUTM){
	var baseUrl = "https://arcgis.metc.state.mn.us/arcgis/rest/services/transit/TIM_Points/MapServer/1/query?"

	var parameters = {};
	parameters["geometry"] = createEnvlopeString(CoordUTM.x, CoordUTM.y, 100);
	parameters["geometryType"] = "esriGeometryEnvelope";
	parameters["geometryPrecision"] = 0;
	parameters["outFields"] = "site_on,site_at,site_id,ROUTES,CORN_DESC,ROUTEDIRS";
	parameters["returnGeometry"] = true;
	parameters["returnIdsOnly"] = false;
	parameters["returnCountOnly"] = false;
	parameters["f"] = "json";

	var req = new XMLHttpRequest();
	req.open('GET',baseUrl + constructURIParameters(parameters),false);
	req.send(null);

	if (req.readyState == 4) {
		if(req.status == 200) {
			try{
				var response = JSON.parse(req.responseText);
			}catch(e){
				console.error("Result Not JSON");
				return;
			}

			try{
				var stops = response.features;
			}catch(e){
				console.warn("No Stops Returned");
				console.warn(e);
				Pebble.sendAppMessage({ "statusMessage": "No Stops Found" });
				return;
			}
		}else{
			console.log("HTTP Error: " + req.status);
		}
	}

	return stops;
}

function fetchFavoriteStops(stopIds){
	var baseUrl = "https://arcgis.metc.state.mn.us/arcgis/rest/services/transit/TIM_Points/MapServer/1/query?"

	var parameters = {};
	parameters["where"] = "site_id in (" + stopIds.join(",") + ")"
	parameters["geometry"] = "{xmin:409675, ymin:4948387, xmax:515310, ymax:5045828}"
	parameters["geometryType"] = "esriGeometryEnvelope";
	parameters["geometryPrecision"] = 0;
	parameters["outFields"] = "site_on,site_at,site_id,ROUTES,CORN_DESC,ROUTEDIRS";
	parameters["returnGeometry"] = true;
	parameters["returnIdsOnly"] = false;
	parameters["returnCountOnly"] = false;
	parameters["f"] = "json";

	console.log("QUerying: "+baseUrl + constructURIParameters(parameters))

	var req = new XMLHttpRequest();
	req.open('GET',baseUrl + constructURIParameters(parameters),false);
	req.send(null);

	if (req.readyState == 4) {
		if(req.status == 200) {
			try{
				var response = JSON.parse(req.responseText);
			}catch(e){
				console.error("Result Not JSON");
				return;
			}

			try{
				var stops = response.features;
			}catch(e){
				console.warn("No Stops Returned");
				console.warn(e);
				Pebble.sendAppMessage({ "statusMessage": "No Stops Found" });
				return;
			}
		}else{
			console.warn("HTTP Error: " + req.status);
		}
	}else{
		console.warn("Ready State Error");
	}

	return stops;
}

function fetchStopTimes(stopNumber){
	var req = new XMLHttpRequest();
	req.open('GET','http://svc.metrotransit.org/NexTrip/' + stopNumber + '?format=json',false);
	req.send(null);

	if (req.readyState == 4) {
		if(req.status == 200) {
			try{
				var response = JSON.parse(req.responseText);
			}catch(e){
				console.error("Result Not JSON");
				return;
			}

			try{
				return response;
			}catch(e){
				console.warn("No Routes Returned");
				Pebble.sendAppMessage({ "statusMessage": "No Routes Returned" });
				return;
			}
		}else{
			console.log("HTTP Error: " + req.status);
		}
	}
}

Pebble.addEventListener("appmessage",
	function(e) {

		if(e.payload.statusMessage !== undefined){
			console.error("Status: " + e.payload.statusMessage);
		};

		if(e.payload.getStops !== undefined){
			console.log("Get Stops: " + e.payload.getStops);

			if(e.payload.getStops === 0){
				var stops = fetchNearestStops(lastGeo);
				sendStopLocation(stops);
			}else if(e.payload.getStops === 1){
				var stops = fetchFavoriteStops(favorite_stops);
				sendStopLocation(stops);
			}
		};

		if(e.payload.getStopTimes !== undefined){
			console.log("Get Stop Times: " + e.payload.getStopTimes);

			var stopNumber = e.payload.getStopTimes;
			var stopTimes = fetchStopTimes(stopNumber)

			sendStopTime(stopTimes);
		};

		if(e.payload.addToFavorites !== undefined){
			console.log("Add Favorite: " + e.payload.addToFavorites);
			if(favorite_stops.indexOf(e.payload.addToFavorites) === -1){
				favorite_stops.push(e.payload.addToFavorites);

				window.localStorage.setItem("favorite_stops", JSON.stringify(favorite_stops));
			}
		};

		if(e.payload.removeFavorites !== undefined){
			console.log("Remove Favorite: " + e.payload.removeFavorites);

			var index = favorite_stops.indexOf(e.payload.removeFavorites)

			if(index >= 0){
				favorite_stops.splice(index, 1);
				window.localStorage.setItem("favorite_stops", JSON.stringify(favorite_stops));
			}
		};

		if(e.payload.placeholder !== undefined){
			console.log("Message: " + e.payload.placeholder);
		};

		var stopNumber;
		console.log("Refreshing Data")
		for(i in e.payload){
			console.log(i);
			console.log(e.payload[i]);
		}
		console.log(e.payload);
	}
);

//TODO: Make this not a global. Make the Following functions more functional.
var numStopsSent = 0;
var stopsToSend = {};

function sendStopLocation(stops){
	console.log(stops)
	numStopsSent = 0;
	stopsToSend = stops;
	Pebble.sendAppMessage({ "getStops": 1,
	                        "listStopsReset": 0},
	                      sendStopLocationContinue,
	                      sendStopLocationError);
}

function sendStopLocationContinue(data){
	//data.transactionId

	if(stopsToSend.length === 0){
		Pebble.sendAppMessage({ "getStops": 1,
	                            "listStopsSiteId": 0,
	                            "listStopsLocation": "No Stops Found",
	                            "listStopsRoutes": "Please Close and Re-Open the App",
	                            "listStopsIsFavorite": 0});
		return;
	}

	if(numStopsSent >= 10 || numStopsSent >= stopsToSend.length){
		return;
	}

	var site_id = stopsToSend[numStopsSent].attributes.site_id;
	var location = stopsToSend[numStopsSent].attributes.site_on.trim() + "&" +
	               stopsToSend[numStopsSent].attributes.site_at.trim() +
	               " (" + stopsToSend[numStopsSent].attributes.CORN_DESC.trim() +  ")";
	var routes = stopsToSend[numStopsSent].attributes.ROUTEDIRS;

	numStopsSent = numStopsSent + 1;
	console.log(numStopsSent);

	Pebble.sendAppMessage({ "getStops": 1,
	                        "listStopsSiteId": site_id,
	                        "listStopsLocation": location,
	                        "listStopsRoutes": routes,
	                        "listStopsIsFavorite": isInNum(site_id, favorite_stops)},
	                      sendStopLocationContinue,
	                      sendStopLocationError);
}

function sendStopLocationError(data){
	//data.transactionId
	console.error("Couldn't Send Stops, Failing")
}

var numTimesSent = 0;
var timesToSend = {};

function sendStopTime(times){
	numTimesSent = 0;
	timesToSend = times;
	Pebble.sendAppMessage({"getStopTimes": 0,
	                       "listStopsReset": 0},
	                      sendStopTimeContinue,
	                      sendStopTimeError);
}

function sendStopTimeContinue(data){
	//data.transactionId

	if(timesToSend.length === 0){
		Pebble.sendAppMessage({"getStopTimes": 0,
	                       "listStopTimesRoute": "No Times Found", 
	                       "listStopTimesDepart": "Try a different stop, maybe?", 
	                       "listStopTimesBlock": 0});
		return;
	}

	if(numTimesSent >= 10 || numTimesSent >= timesToSend.length){
		return;
	}

	var route = timesToSend[numTimesSent]['Route'] +
	            timesToSend[numTimesSent]['Terminal'] + " " +
	            timesToSend[numTimesSent]['RouteDirection'];
	var time = timesToSend[numTimesSent]['DepartureText'];
	var block = timesToSend[numTimesSent]['BlockNumber'];

	numTimesSent = numTimesSent + 1;

	Pebble.sendAppMessage({"getStopTimes": 0,
	                       "listStopTimesRoute": route, 
	                       "listStopTimesDepart": time, 
	                       "listStopTimesBlock": block},
	                      sendStopTimeContinue,
	                      sendStopTimeError);

}

function sendStopTimeError(data){
	//data.transactionId
	console.error("Couldn't Send Times, Failing")
}

function isInNum(name, container){
	if(container.indexOf(name) >= 0){
		return 1;
	}else{
		return 0;
	}
}




//////////////////////////////////////////////////////////////////////
//
//       UTM <->  WGS 84 (World Geodetic System) Conversions
//
//////////////////////////////////////////////////////////////////////


var pi = 3.14159265358979;

/* Ellipsoid model constants (actual values here are for WGS84) */
var sm_a = 6378137.0;
var sm_b = 6356752.314;
var sm_EccSquared = 6.69437999013e-03;

var UTMScaleFactor = 0.9996;


/*
* DegToRad
*
* Converts degrees to radians.
*
*/
function DegToRad (deg)
{
	return (deg / 180.0 * pi)
}




/*
* RadToDeg
*
* Converts radians to degrees.
*
*/
function RadToDeg (rad)
{
	return (rad / pi * 180.0)
}




/*
* ArcLengthOfMeridian
*
* Computes the ellipsoidal distance from the equator to a point at a
* given latitude.
*
* Reference: Hoffmann-Wellenhof,B.,Lichtenegger,H.,and Collins,J.,
* GPS: Theory and Practice,3rd ed.  New York: Springer-Verlag Wien,1994.
*
* Inputs:
*     phi - Latitude of the point,in radians.
*
* Globals:
*     sm_a - Ellipsoid model major axis.
*     sm_b - Ellipsoid model minor axis.
*
* Returns:
*     The ellipsoidal distance of the point from the equator,in meters.
*
*/
function ArcLengthOfMeridian (phi)
{
	var alpha,beta,gamma,delta,epsilon,n;
	var result;

	/* Precalculate n */
	n = (sm_a - sm_b) / (sm_a + sm_b);

	/* Precalculate alpha */
	alpha = ((sm_a + sm_b) / 2.0)
	   * (1.0 + (Math.pow (n,2.0) / 4.0) + (Math.pow (n,4.0) / 64.0));

	/* Precalculate beta */
	beta = (-3.0 * n / 2.0) + (9.0 * Math.pow (n,3.0) / 16.0)
	   + (-3.0 * Math.pow (n,5.0) / 32.0);

	/* Precalculate gamma */
	gamma = (15.0 * Math.pow (n,2.0) / 16.0)
		+ (-15.0 * Math.pow (n,4.0) / 32.0);

	/* Precalculate delta */
	delta = (-35.0 * Math.pow (n,3.0) / 48.0)
		+ (105.0 * Math.pow (n,5.0) / 256.0);

	/* Precalculate epsilon */
	epsilon = (315.0 * Math.pow (n,4.0) / 512.0);

	/* Now calculate the sum of the series and return */
	result = alpha
		* (phi + (beta * Math.sin (2.0 * phi))
		+ (gamma * Math.sin (4.0 * phi))
		+ (delta * Math.sin (6.0 * phi))
		+ (epsilon * Math.sin (8.0 * phi)));

return result;
}



/*
* UTMCentralMeridian
*
* Determines the central meridian for the given UTM zone.
*
* Inputs:
*     zone - An integer value designating the UTM zone,range [1,60].
*
* Returns:
*   The central meridian for the given UTM zone,in radians,or zero
*   if the UTM zone parameter is outside the range [1,60].
*   Range of the central meridian is the radian equivalent of [-177,+177].
*
*/
function UTMCentralMeridian (zone)
{
	var cmeridian;

	cmeridian = DegToRad (-183.0 + (zone * 6.0));

	return cmeridian;
}



/*
* FootpointLatitude
*
* Computes the footpoint latitude for use in converting transverse
* Mercator coordinates to ellipsoidal coordinates.
*
* Reference: Hoffmann-Wellenhof,B.,Lichtenegger,H.,and Collins,J.,
*   GPS: Theory and Practice,3rd ed.  New York: Springer-Verlag Wien,1994.
*
* Inputs:
*   y - The UTM northing coordinate,in meters.
*
* Returns:
*   The footpoint latitude,in radians.
*
*/
function FootpointLatitude (y)
{
	var y_,alpha_,beta_,gamma_,delta_,epsilon_,n;
	var result;
	
	/* Precalculate n (Eq. 10.18) */
	n = (sm_a - sm_b) / (sm_a + sm_b);
		
	/* Precalculate alpha_ (Eq. 10.22) */
	/* (Same as alpha in Eq. 10.17) */
	alpha_ = ((sm_a + sm_b) / 2.0)
		* (1 + (Math.pow (n,2.0) / 4) + (Math.pow (n,4.0) / 64));
	
	/* Precalculate y_ (Eq. 10.23) */
	y_ = y / alpha_;
	
	/* Precalculate beta_ (Eq. 10.22) */
	beta_ = (3.0 * n / 2.0) + (-27.0 * Math.pow (n,3.0) / 32.0)
		+ (269.0 * Math.pow (n,5.0) / 512.0);
	
	/* Precalculate gamma_ (Eq. 10.22) */
	gamma_ = (21.0 * Math.pow (n,2.0) / 16.0)
		+ (-55.0 * Math.pow (n,4.0) / 32.0);
		
	/* Precalculate delta_ (Eq. 10.22) */
	delta_ = (151.0 * Math.pow (n,3.0) / 96.0)
		+ (-417.0 * Math.pow (n,5.0) / 128.0);
		
	/* Precalculate epsilon_ (Eq. 10.22) */
	epsilon_ = (1097.0 * Math.pow (n,4.0) / 512.0);
		
	/* Now calculate the sum of the series (Eq. 10.21) */
	result = y_ + (beta_ * Math.sin (2.0 * y_))
		+ (gamma_ * Math.sin (4.0 * y_))
		+ (delta_ * Math.sin (6.0 * y_))
		+ (epsilon_ * Math.sin (8.0 * y_));
	
	return result;
}



/*
* MapLatLonToXY
*
* Converts a latitude/longitude pair to x and y coordinates in the
* Transverse Mercator projection.  Note that Transverse Mercator is not
* the same as UTM; a scale factor is required to convert between them.
*
* Reference: Hoffmann-Wellenhof,B.,Lichtenegger,H.,and Collins,J.,
* GPS: Theory and Practice,3rd ed.  New York: Springer-Verlag Wien,1994.
*
* Inputs:
*    phi - Latitude of the point,in radians.
*    lambda - Longitude of the point,in radians.
*    lambda0 - Longitude of the central meridian to be used,in radians.
*
* Outputs:
*    xy - A 2-element array containing the x and y coordinates
*         of the computed point.
*
* Returns:
*    The function does not return a value.
*
*/
function MapLatLonToXY (phi,lambda,lambda0)
{
	var N,nu2,ep2,t,t2,l;
	var l3coef,l4coef,l5coef,l6coef,l7coef,l8coef;
	var tmp;
	var coord = {};

	/* Precalculate ep2 */
	ep2 = (Math.pow (sm_a,2.0) - Math.pow (sm_b,2.0)) / Math.pow (sm_b,2.0);

	/* Precalculate nu2 */
	nu2 = ep2 * Math.pow (Math.cos (phi),2.0);

	/* Precalculate N */
	N = Math.pow (sm_a,2.0) / (sm_b * Math.sqrt (1 + nu2));

	/* Precalculate t */
	t = Math.tan (phi);
	t2 = t * t;
	tmp = (t2 * t2 * t2) - Math.pow (t,6.0);

	/* Precalculate l */
	l = lambda - lambda0;

	/* Precalculate coefficients for l**n in the equations below
	   so a normal human being can read the expressions for easting
	   and northing
	   -- l**1 and l**2 have coefficients of 1.0 */
	l3coef = 1.0 - t2 + nu2;

	l4coef = 5.0 - t2 + 9 * nu2 + 4.0 * (nu2 * nu2);

	l5coef = 5.0 - 18.0 * t2 + (t2 * t2) + 14.0 * nu2
		- 58.0 * t2 * nu2;

	l6coef = 61.0 - 58.0 * t2 + (t2 * t2) + 270.0 * nu2
		- 330.0 * t2 * nu2;

	l7coef = 61.0 - 479.0 * t2 + 179.0 * (t2 * t2) - (t2 * t2 * t2);

	l8coef = 1385.0 - 3111.0 * t2 + 543.0 * (t2 * t2) - (t2 * t2 * t2);

	/* Calculate easting (x) */
	coord.x = N * Math.cos (phi) * l
		+ (N / 6.0 * Math.pow (Math.cos (phi),3.0) * l3coef * Math.pow (l,3.0))
		+ (N / 120.0 * Math.pow (Math.cos (phi),5.0) * l5coef * Math.pow (l,5.0))
		+ (N / 5040.0 * Math.pow (Math.cos (phi),7.0) * l7coef * Math.pow (l,7.0));

	/* Calculate northing (y) */
	coord.y = ArcLengthOfMeridian (phi)
		+ (t / 2.0 * N * Math.pow (Math.cos (phi),2.0) * Math.pow (l,2.0))
		+ (t / 24.0 * N * Math.pow (Math.cos (phi),4.0) * l4coef * Math.pow (l,4.0))
		+ (t / 720.0 * N * Math.pow (Math.cos (phi),6.0) * l6coef * Math.pow (l,6.0))
		+ (t / 40320.0 * N * Math.pow (Math.cos (phi),8.0) * l8coef * Math.pow (l,8.0));

	return coord;
}



/*
* MapXYToLatLon
*
* Converts x and y coordinates in the Transverse Mercator projection to
* a latitude/longitude pair.  Note that Transverse Mercator is not
* the same as UTM; a scale factor is required to convert between them.
*
* Reference: Hoffmann-Wellenhof,B.,Lichtenegger,H.,and Collins,J.,
*   GPS: Theory and Practice,3rd ed.  New York: Springer-Verlag Wien,1994.
*
* Inputs:
*   x - The easting of the point,in meters.
*   y - The northing of the point,in meters.
*   lambda0 - Longitude of the central meridian to be used,in radians.
*
* Outputs:
*   philambda - A 2-element containing the latitude and longitude
*               in radians.
*
* Returns:
*   The function does not return a value.
*
* Remarks:
*   The local variables Nf,nuf2,tf,and tf2 serve the same purpose as
*   N,nu2,t,and t2 in MapLatLonToXY,but they are computed with respect
*   to the footpoint latitude phif.
*
*   x1frac,x2frac,x2poly,x3poly,etc. are to enhance readability and
*   to optimize computations.
*
*/
function MapXYToLatLon (x,y,lambda0)
{
	var phif,Nf,Nfpow,nuf2,ep2,tf,tf2,tf4,cf;
	var x1frac,x2frac,x3frac,x4frac,x5frac,x6frac,x7frac,x8frac;
	var x2poly,x3poly,x4poly,x5poly,x6poly,x7poly,x8poly;
	
	/* Get the value of phif,the footpoint latitude. */
	phif = FootpointLatitude (y);
		
	/* Precalculate ep2 */
	ep2 = (Math.pow (sm_a,2.0) - Math.pow (sm_b,2.0))
		  / Math.pow (sm_b,2.0);
		
	/* Precalculate cos (phif) */
	cf = Math.cos (phif);
		
	/* Precalculate nuf2 */
	nuf2 = ep2 * Math.pow (cf,2.0);
		
	/* Precalculate Nf and initialize Nfpow */
	Nf = Math.pow (sm_a,2.0) / (sm_b * Math.sqrt (1 + nuf2));
	Nfpow = Nf;
		
	/* Precalculate tf */
	tf = Math.tan (phif);
	tf2 = tf * tf;
	tf4 = tf2 * tf2;
	
	/* Precalculate fractional coefficients for x**n in the equations
	   below to simplify the expressions for latitude and longitude. */
	x1frac = 1.0 / (Nfpow * cf);
	
	Nfpow *= Nf;   /* now equals Nf**2) */
	x2frac = tf / (2.0 * Nfpow);
	
	Nfpow *= Nf;   /* now equals Nf**3) */
	x3frac = 1.0 / (6.0 * Nfpow * cf);
	
	Nfpow *= Nf;   /* now equals Nf**4) */
	x4frac = tf / (24.0 * Nfpow);
	
	Nfpow *= Nf;   /* now equals Nf**5) */
	x5frac = 1.0 / (120.0 * Nfpow * cf);
	
	Nfpow *= Nf;   /* now equals Nf**6) */
	x6frac = tf / (720.0 * Nfpow);
	
	Nfpow *= Nf;   /* now equals Nf**7) */
	x7frac = 1.0 / (5040.0 * Nfpow * cf);
	
	Nfpow *= Nf;   /* now equals Nf**8) */
	x8frac = tf / (40320.0 * Nfpow);
	
	/* Precalculate polynomial coefficients for x**n.
	   -- x**1 does not have a polynomial coefficient. */
	x2poly = -1.0 - nuf2;
	
	x3poly = -1.0 - 2 * tf2 - nuf2;
	
	x4poly = 5.0 + 3.0 * tf2 + 6.0 * nuf2 - 6.0 * tf2 * nuf2
		- 3.0 * (nuf2 *nuf2) - 9.0 * tf2 * (nuf2 * nuf2);
	
	x5poly = 5.0 + 28.0 * tf2 + 24.0 * tf4 + 6.0 * nuf2 + 8.0 * tf2 * nuf2;
	
	x6poly = -61.0 - 90.0 * tf2 - 45.0 * tf4 - 107.0 * nuf2
		+ 162.0 * tf2 * nuf2;
	
	x7poly = -61.0 - 662.0 * tf2 - 1320.0 * tf4 - 720.0 * (tf4 * tf2);
	
	x8poly = 1385.0 + 3633.0 * tf2 + 4095.0 * tf4 + 1575 * (tf4 * tf2);
		
	/* Calculate latitude */
	philambda.lat = phif + x2frac * x2poly * (x * x)
		+ x4frac * x4poly * Math.pow (x,4.0)
		+ x6frac * x6poly * Math.pow (x,6.0)
		+ x8frac * x8poly * Math.pow (x,8.0);
		
	/* Calculate longitude */
	philambda.lon = lambda0 + x1frac * x
		+ x3frac * x3poly * Math.pow (x,3.0)
		+ x5frac * x5poly * Math.pow (x,5.0)
		+ x7frac * x7poly * Math.pow (x,7.0);
		
	return philambda;
}




/*
* LatLonToUTMXY
*
* Converts a latitude/longitude pair to x and y coordinates in the
* Universal Transverse Mercator projection.
*
* Inputs:
*   lat - Latitude of the point, in radians.
*   lon - Longitude of the point, in radians.
*   zone - UTM zone to be used for calculating values for x and y.
*          If zone is less than 1 or greater than 60,the routine
*          will determine the appropriate zone from the value of lon.
*
* Outputs:
*   coord - A 2-element object where the UTM x and y values will be stored.
*
* Returns:
*   The UTM zone used for calculating the values of x and y.
*
*/
function LatLonToUTMXY (lat,lon,zone)
{
	var coord = MapLatLonToXY (lat,lon,UTMCentralMeridian (zone));

	/* Adjust easting and northing for UTM system. */
	coord.x = coord.x * UTMScaleFactor + 500000.0;
	coord.y = coord.y * UTMScaleFactor;
	if (coord.y < 0.0)
		coord.y = coord.y + 10000000.0;

	return coord;
}



/*
* UTMXYToLatLon
*
* Converts x and y coordinates in the Universal Transverse Mercator
* projection to a latitude/longitude pair.
*
* Inputs:
*   x - The easting of the point, in meters.
*   y - The northing of the point, in meters.
*   zone - The UTM zone in which the point lies.
*   southhemi - True if the point is in the southern hemisphere;
*               false otherwise.
*
* Outputs:
*   coord - A 2-element object containing the `lat` and
*           `lon` of the point, in radians.
*
* Returns:
*   The function does not return a value.
*
*/
function UTMXYToLatLon (x,y,zone,southhemi)
{
	var cmeridian;
		
	x -= 500000.0;
	x /= UTMScaleFactor;
		
	/* If in southern hemisphere,adjust y accordingly. */
	if (southhemi)
	y -= 10000000.0;
			
	y /= UTMScaleFactor;
	
	cmeridian = UTMCentralMeridian (zone);
	return MapXYToLatLon (x,y,cmeridian);
}




/*
* LatLonDegToUTMXY
*
* Converts a latitude/longitude pair to x and y coordinates in the
* Universal Transverse Mercator projection.
*
* Inputs:
*   lat - Latitude of the point, in degrees.
*   lon - Longitude of the point, in degrees.
*   zone - UTM zone to be used for calculating values for x and y.
*          If zone is less than 1 or greater than 60,the routine
*          will determine the appropriate zone from the value of lon.
*
* Outputs:
*   coord - A 2-element object where the UTM x and y values will be stored.
*
* Returns:
*   The UTM zone used for calculating the values of x and y.
*
*/
function LatLonDegToUTMXY (lat,lon,zone)
{
	return LatLonToUTMXY(DegToRad(lat),DegToRad(lon),zone);
}



/*
* UTMXYToLatLonDeg
*
* Converts x and y coordinates in the Universal Transverse Mercator
* projection to a latitude/longitude pair.
*
* Inputs:
*   x - The easting of the point, in meters.
*   y - The northing of the point, in meters.
*   zone - The UTM zone in which the point lies.
*   southhemi - True if the point is in the southern hemisphere;
*               false otherwise.
*
* Outputs:
*   coord - A 2-element object containing the `lat` and
*           `lon` of the point, in degrees.
*
* Returns:
*   The function does not return a value.
*
*/
function UTMXYToLatLonDeg (x,y,zone,southhemi)
{
	var coord = UTMXYToLatLon(x,y,zone,southhemi);
	
	return {lat: RadToDeg(coord.lat), lon: RadToDeg(coord.lon)};
}
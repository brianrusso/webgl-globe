# WebGL Globe

This globe is based on [dataarts/webgl-globe](https://github.com/dataarts/webgl-globe).

This globe can add and update points in realtime.

## Run example

```
$ git clone git@github.com:roback/webgl-globe.git
$ cd webgl-globe
$ python -m SimpleHTTPServer

# Open web browser and go to localhost:8000
```

## Usage

```javascript
var container = document.getElementById( 'container' );

// This is the default
var globeOpts = {
  mapImage:            '/images/world.jpg',
  minHeight:           0.1,
  maxHeight:           180,
  maxAge:              10000,
  ageDelay:            1000,
  heightDecreaseSpeed: 100,
  heightIncreaseSpeed: 100,
  coordinatePrecision: 2,
  onPointAging:        function(point){},
  onPointUpdated:      function(point){},
};

// Make the globe
var globe = new Globe(container, globeOpts);

// Begin animation
globe.animate();

// This is the default
var pointOpts = {
  opts.amount:            1,
  opts.maxAge:              // Defaults to globeOpts.maxAge
  opts.ageDelay:            // Defaults to globeOpts.ageDelay
  opts.heightDecreaseSpeed: // Defaults to globeOpts.heightDecreaseSpeed
  opts.heightIncreaseSpeed: // Defaults to globeOpts.heightIncreaseSpeed
  opts.onPointAging:        // Defaults to globeOpts.onPointAging
  opts.onPointUpdated       // Defaults to globeOpts.onPointUpdated
};

// Update point/add new if it doesnt exist
globe.updatePoint(lat, lng, pointOpts);
```

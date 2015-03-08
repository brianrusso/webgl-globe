# WebGL Globe

This globe is based on [dataarts/webgl-globe](https://github.com/dataarts/webgl-globe).

This globe can add and update points in realtime.

# Usage

```javascript
var container = document.getElementById( 'container' );

// This is the default
var globeOpts = {
  mapImage:            '/images/world.jpg',
  minHeight:           0.1,
  maxHeight:           180,
  ageDelay:            1000,
  ageTimePerUnit:      100,
  updateTimePerUnit:   100,
  coordinatePrecision: 2,
  onPointAging:        function(pointMesh){},
  onPointUpdated:      function(pointMesh){},
};

// Make the globe
var globe = new Globe(container, globeOpts);

// Begin animation
globe.animate();

// This is the default
var pointOpts = {
  opts.amount:            1,
  opts.ageTimePerUnit:    // Defaults to globeOpts.ageTimePerUnit
  opts.updateTimePerUnit: // Defaults to globeOpts.updateTimePerUnit
  opts.onPointAging:      // Defaults to globeOpts.onPointAging
  opts.onPointUpdated     // Defaults to globeOpts.onPointUpdated
};

// Update point/add new if it doesnt exist
globe.updatePoint(lat, lng, pointOpts);
```

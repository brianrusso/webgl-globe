/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
 * Copyright 2015 Mattias Roback
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

Globe = function(container, opts) {
  var self = this;

  self.points = {};

  opts = opts || {};

  self.mapImage = opts.mapImage || '/images/world.jpg';

  self.minHeight           = opts.minHeight           || 0.1;
  self.maxHeight           = opts.maxHeight           || 50;
  self.pointSize           = opts.pointSize           || 3;
  self.heightDecreaseSpeed = opts.heightDecreaseSpeed || 100;
  self.heightIncreaseSpeed = opts.heightIncreaseSpeed || 100;
 // 1 for nice speed
  self.rotationSpeed       = opts.rotationSpeed       || 2;

  self.coordinatePrecision = opts.coordinatePrecision || 2;

  self.pointBaseGeometry = new THREE.BoxGeometry( self.pointSize, self.pointSize, 1 );
  // Sets geometry origin to bottom, makes z scaling only scale in an upwards direction
  self.pointBaseGeometry.applyMatrix( new THREE.Matrix4().makeTranslation( 0, 0, -0.5 ) );
  self.pointBaseMaterial = new THREE.MeshBasicMaterial( { color: 0xffffff } );

  var Shaders = {
    'earth' : {
      uniforms: {
        'texture': { type: 't', value: null }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          'vNormal = normalize( normalMatrix * normal );',
          'vUv = uv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D texture;',
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'vec3 diffuse = texture2D( texture, vUv ).xyz;',
          'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
          'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
          'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
        '}'
      ].join('\n')
    },
    'atmosphere' : {
      uniforms: {},
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'vNormal = normalize( normalMatrix * normal );',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );',
          'gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;',
        '}'
      ].join('\n')
    }
  };

  var camera, scene, renderer, w, h;
  var globeMesh;

  var overRenderer;

  var curZoomSpeed = 0;
  var zoomSpeed = 50;

  var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 }, touchOnDown = { x: 0, y: 0 } ;
  var rotation = { x: 0, y: 0 },
      target = { x: Math.PI*3/2, y: Math.PI / 6.0 },
      targetOnDown = { x: 0, y: 0 };

  var distance = 100000, distanceTarget = 100000;
  var padding = 40;
  var PI_HALF = Math.PI / 2;

  var prevUpdateTime = new Date().getTime();

  var TWEEN_SPEED = 2000;
  var MIN_DATA_THRESHOLD = 0.1;
  var paused = false;
  var pausedTime = 0;

  function init() {

    container.style.color = '#fff';
    container.style.font = '13px/20px Arial, sans-serif';

    var shader, uniforms;
    w = container.offsetWidth  || window.innerWidth;
    h = container.offsetHeight || window.innerHeight;

    camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
    camera.position.z = distance;

    scene = new THREE.Scene();

    // Globe
    var globeGeometry = new THREE.SphereGeometry(200, 40, 30);

    shader   = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms['texture'].value = THREE.ImageUtils.loadTexture(self.mapImage);

    var globeMaterial = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    globeMesh.rotation.y = Math.PI;
    scene.add(globeMesh);

    // Atmosphere
    shader   = Shaders['atmosphere'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    var atmosphereMaterial = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true

        });

    var atmosphereMesh = new THREE.Mesh(globeGeometry, atmosphereMaterial);
    atmosphereMesh.scale.set( 1.1, 1.1, 1.1 );
    scene.add(atmosphereMesh);

    // Renderer
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(w, h);

    renderer.domElement.style.position = 'absolute';

    container.appendChild(renderer.domElement);

    // Event listeners
    container.addEventListener('touchstart', onTouchDown, false);
    container.addEventListener('mousedown', onMouseDown, false);
    container.addEventListener('mousewheel', onMouseWheel, false);
    document.addEventListener('keydown', onDocumentKeyDown, false);
    window.addEventListener('resize', onWindowResize, false);

    container.addEventListener('mouseover', function() {
      overRenderer = true;
    }, false);

   container.addEventListener('touchend', function() {
     overRenderer = false;
    }, false);

    container.addEventListener('mouseout', function() {
      overRenderer = false;
    }, false);
  }

  function deletePoints() {
    self.points = {};
  }
  self.deletePoints = deletePoints;

  function roundCoord(coord) {
    return parseFloat(Math.round(coord).toFixed(self.coordinatePrecision));
  };

  function createPointKey(lat, lng){
    return lat + ":" + lng;
  };

  function loadArray(array) {
    var point_list = []
    for (i=0; i < array.length; i++) {
        var lat = array[i]
        var lng = array[i+1]
        var amount = array[i+2]
        var opts = {amount: amount};
        //console.log(array[i] + " " + array[i+1] + " " + array[i+2])
        if (amount > MIN_DATA_THRESHOLD) point_list.push({lat: lat, lng: lng, opts: opts});
        i = i + 2
    }
    self.updatePoints(point_list);
  }
 self.loadArray = loadArray;

  function updatePoints(points) {
    // first we figure out what all the new points are.
    var new_points = {};
    for (var i=0; i < points.length; i++) {

        lat = roundCoord(points[i].lat);
        lng = roundCoord(points[i].lng);
        pointkey = createPointKey(lat, lng)
        new_points[pointkey] = true;
    }
    // Then we iterate over existing points, see if any will be going away
    for (var key in self.points) {
        if(self.points.hasOwnProperty(key)) {
            var pointwillstay = new_points[key]
            if(pointwillstay) { // if this old key is in the new collection, do nothing
            } else { // if this old key is NOT in the new collection, remove it
                var pointToRemove = self.points[key]
                // Remove it from our list of points
                delete self.points[key]
                // Tween it away.. then remove from scene
                updateExistingPoint(pointToRemove, {amount: 0, delete: true})

            }
        }
    }
    for (var i=0; i < points.length; i++) {
        self.updatePoint(points[i].lat, points[i].lng, points[i].opts)
    }


  }
  self.updatePoints = updatePoints;

  function updatePoint(lat, lng, opts) {
    opts = opts || {};

    opts.amount              = opts.amount              || 1;
    opts.heightDecreaseSpeed = opts.heightDecreaseSpeed || self.heightDecreaseSpeed;
    opts.heightIncreaseSpeed = opts.heightIncreaseSpeed || self.heightIncreaseSpeed;

    if (opts.amount > self.maxHeight)
      opts.amount = self.maxHeight;


    lat = roundCoord(lat);
    lng = roundCoord(lng);

    var pointKey      = createPointKey(lat, lng);
    var existingPoint = self.points[pointKey];
    // update existing
    if (existingPoint) {
      updateExistingPoint(existingPoint, opts);
    } else {
    // create new one
      self.points[pointKey] = createNewPoint(lat, lng, opts);
      updateExistingPoint(self.points[pointKey], opts);
    }
  };
  self.updatePoint = updatePoint;

  function createNewPoint(lat, lng, opts) {
    var pointMesh = new THREE.Mesh( self.pointBaseGeometry, self.pointBaseMaterial.clone() );

    var phi = (90 - lat) * Math.PI / 180;
    var theta = (180 - lng) * Math.PI / 180;

    pointMesh.position.x = 200 * Math.sin(phi) * Math.cos(theta);
    pointMesh.position.y = 200 * Math.cos(phi);
    pointMesh.position.z = 200 * Math.sin(phi) * Math.sin(theta);

    pointMesh.lookAt(globeMesh.position);

    scene.add( pointMesh );

    var point = {
      mesh: pointMesh,
    }

    point.heightTween = TweenPoint(point, opts);
    point.heightTween.start(getTotalRunningTime());

    return point;
  }

  function updateExistingPoint(point, opts) {

    point.heightTween.stop();
    // tween to new height
    point.heightTween = TweenPoint(point, opts);
    point.heightTween.start(getTotalRunningTime());

  }


  function setColour(point, amount) {
  // hide tiny values
    if(amount < 1) {
        var lightness = 0;
    } else {
        var lightness = 0.5;
    }
    var hue = ((1 - amount/self.maxHeight) * 0.7 )
    point.mesh.material.color.setHSL(hue, 1, lightness);
  }


  function TweenPoint(point, opts) {
    var heightTo = opts.amount * self.maxHeight;
    if (heightTo >= self.maxHeight) {
      heightTo = self.maxHeight;
    }

    return new TWEEN.Tween(point.mesh.scale)
    .to({ z: heightTo }, TWEEN_SPEED)
    //.to({ z: heightTo }, heightTo * 1000/opts.heightIncreaseSpeed)
    .easing(TWEEN.Easing.Linear.None)
    .onUpdate(function() {
        setColour(point, this.z);
    })
    // Delete the point after we tween it away (if delete is set)
    .onComplete(function() {
        if(opts.delete) {
            scene.remove(point.mesh);
        }
    });

  }

  function onMouseDown(event) {
    event.preventDefault();

    container.addEventListener('mousemove', onMouseMove, false);
    container.addEventListener('mouseup', onMouseUp, false);
    container.addEventListener('mouseout', onMouseOut, false);

    mouseOnDown.x = - event.clientX;
    mouseOnDown.y = event.clientY;

    targetOnDown.x = target.x;
    targetOnDown.y = target.y;

    container.style.cursor = 'move';
  }

  function onTouchDown(event) {
    event.preventDefault();

    container.addEventListener('touchmove', onTouchMove, false);
    container.addEventListener('touchend', onTouchEnd, false);
    container.addEventListener('touchleave', onTouchEnd, false);
    container.addEventListener('touchcancel', onTouchEnd, false);

    touchOnDown.x = -event.touches[0].clientX;
    touchOnDown.y = event.touches[0].clientY;

    targetOnDown.x = target.x;
    targetOnDown.y = target.y;
  }

  function onTouchMove(event) {
    mouse.x = -event.touches[0].clientX;
    mouse.y = event.touches[0].clientY;

    var zoomDamp = distance/2000;

    target.x = targetOnDown.x + (mouse.x - touchOnDown.x) * 0.005 * zoomDamp;
    target.y = targetOnDown.y + (mouse.y - touchOnDown.y) * 0.005 * zoomDamp;

    target.y = target.y > PI_HALF ? PI_HALF : target.y;
    target.y = target.y < -PI_HALF ? -PI_HALF : target.y;
  }

  function onTouchEnd(event) {
    container.removeEventListener('touchmove', onTouchMove, false);
  }

  function onMouseMove(event) {
    mouse.x = - event.clientX;
    mouse.y = event.clientY;

    var zoomDamp = distance/1000;

    target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
    target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

    target.y = target.y > PI_HALF ? PI_HALF : target.y;
    target.y = target.y < - PI_HALF ? - PI_HALF : target.y;
  }

  function onMouseUp(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
    container.style.cursor = 'auto';
  }

  function onMouseOut(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
  }

  function onMouseWheel(event) {
    event.preventDefault();
    if (overRenderer) {
      zoom(event.wheelDeltaY * 0.3);
    }
    return false;
  }

  function onDocumentKeyDown(event) {
    switch (event.keyCode) {
      case 38:
        zoom(100);
        event.preventDefault();
        break;
      case 40:
        zoom(-100);
        event.preventDefault();
        break;
    }
  }

  function onWindowResize( event ) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  }

  function zoom(delta) {
    distanceTarget -= delta;
    distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
    distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
  }

  function rotateGlobe(deltaSeconds) {
    if (self.rotationSpeed != 0) {

      if (deltaSeconds > 0 && deltaSeconds < 1) {
        target.x += self.rotationSpeed * deltaSeconds / -20;
      }
    }
  }

  function getTotalRunningTime() {
    return prevUpdateTime - pausedTime;
  }

  function animate(time) {
    var delta = time - prevUpdateTime;
    prevUpdateTime = time;

    requestAnimationFrame(animate);
    if (paused) {
      pausedTime += delta;
    } else {
      TWEEN.update(getTotalRunningTime());
      rotateGlobe(delta / 1000);
    }

    render();
  }

  function render() {
    zoom(curZoomSpeed);

    rotation.x += (target.x - rotation.x) * 0.1;
    rotation.y += (target.y - rotation.y) * 0.1;
    distance += (distanceTarget - distance) * 0.3;

    camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
    camera.position.y = distance * Math.sin(rotation.y);
    camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

    camera.lookAt(globeMesh.position);

    renderer.render(scene, camera);
  }

  function start() {
    animate(prevUpdateTime);
  }

  function togglePause() {
    paused = !paused;
  }
  self.togglePause = togglePause;

  init();
  this.start = start;

  this.renderer = renderer;
  this.scene = scene;

  return this;

};


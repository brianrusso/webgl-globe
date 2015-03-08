/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
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

  self.coordinatePrecision = opts.coordinatePrecision || 2;

  self.minHeight = opts.minHeight || 0.1;
  self.maxHeight = opts.maxHeight || 180;
  self.ageDelay  = opts.ageDelay  || 1000;

  self.ageTimePerUnit    = opts.ageTimePerUnit    || 100;
  self.updateTimePerUnit = opts.updateTimePerUnit || 100;

  self.pointBaseGeometry = new THREE.BoxGeometry( 1, 1, 1 );
  self.pointBaseMaterial = new THREE.MeshBasicMaterial( { color: 0xffff00 } );

  self.defaultPointAgingCallback = function(pointMesh) {
    var height = pointMesh.scale.z;
    pointMesh.material.color.setHSL( (1 - (height / self.maxHeight)) * 0.66, 1, 0.5);
  };

  self.defaultPointUpdatedCallback = function(pointMesh) {
    pointMesh.material.color.setHex(0xffffff);
  };



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

  var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
  var rotation = { x: 0, y: 0 },
      target = { x: Math.PI*3/2, y: Math.PI / 6.0 },
      targetOnDown = { x: 0, y: 0 };

  var distance = 100000, distanceTarget = 100000;
  var padding = 40;
  var PI_HALF = Math.PI / 2;

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
    container.addEventListener('mousedown', onMouseDown, false);
    container.addEventListener('mousewheel', onMouseWheel, false);
    document.addEventListener('keydown', onDocumentKeyDown, false);
    window.addEventListener('resize', onWindowResize, false);

    container.addEventListener('mouseover', function() {
      overRenderer = true;
    }, false);

    container.addEventListener('mouseout', function() {
      overRenderer = false;
    }, false);
  }

  function roundCoord(coord) {
    return parseFloat(Math.round(coord).toFixed(self.coordinatePrecision));
  };

  function createPointKey(lat, lng){
    return lat + ":" + lng;
  };

  function addPoint(lat, lng, opts) {
    opts                    = opts                    || {};
    opts.amount             = opts.amount             || 1;
    opts.ageTimePerBlock    = opts.ageTimePerBlock    || 100;
    opts.updateTimePerBlock = opts.updateTimePerBlock || 100;

    if (opts.amount > self.maxHeight)
      opts.amount = self.maxHeight;

    opts.onPointAge     = opts.onPointAge     || self.defaultPointAgingCallback;
    opts.onPointUpdated = opts.onPointUpdated || self.defaultPointUpdatedCallback;

    lat = roundCoord(lat);
    lng = roundCoord(lng);

    var pointKey      = createPointKey(lat, lng);
    var existingPoint = self.points[pointKey];
    if (existingPoint) {
      updateExistingPoint(existingPoint, opts);
    } else {
      self.points[pointKey] = createNewPoint(lat, lng, opts);
    }
  };
  self.addPoint = addPoint;

  function createNewPoint(lat, lng, opts) {
    var pointMesh = new THREE.Mesh( self.pointBaseGeometry, self.pointBaseMaterial.clone() );

    var phi = (90 - lat) * Math.PI / 180;
    var theta = (180 - lng) * Math.PI / 180;

    pointMesh.position.x = 200 * Math.sin(phi) * Math.cos(theta);
    pointMesh.position.y = 200 * Math.cos(phi);
    pointMesh.position.z = 200 * Math.sin(phi) * Math.sin(theta);

    pointMesh.lookAt(globeMesh.position);

    pointMesh.scale.z = Math.max( opts.amount, self.minHeight ); // avoid non-invertible matrix
    pointMesh.updateMatrix();

    scene.add( pointMesh );

    var tween = createAgeTweenForMesh(pointMesh, opts)//.start();
    tween.start();

    return {
      mesh: pointMesh,
      tween: tween,
    };
  }

  function updateExistingPoint(point, opts) {
    point.tween.stop();
    point.tween = createUpdateTweenForPoint(point, opts);
    point.tween.start();
  }

  function createAgeTweenForMesh(pointMesh, opts) {
    return new TWEEN.Tween(pointMesh.scale)
    .to({ z: self.minHeight }, pointMesh.scale.z * opts.ageTimePerBlock)
    .easing(TWEEN.Easing.Quadratic.InOut)
    .onUpdate(function() {
      opts.onPointAge(pointMesh);
    });
  }

  function createUpdateTweenForPoint(point, opts) {
    var heightTo = point.mesh.scale.z + opts.amount;
    if (heightTo >= self.maxHeight) {
      heightTo = self.maxHeight;
    }

    return new TWEEN.Tween(point.mesh.scale)
    .to({ z: heightTo }, heightTo * opts.updateTimePerBlock/10)
    .easing(TWEEN.Easing.Bounce.Out)
    .onUpdate(function() {
      opts.onPointUpdated(point.mesh);
    })
    .onComplete(function() {
      point.tween = createAgeTweenForMesh(point.mesh, opts);
      point.tween.delay(self.ageDelay);
      point.tween.start();
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

  function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
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

  init();
  this.animate = animate;

  this.renderer = renderer;
  this.scene = scene;

  return this;

};


// @target aftereffects
(function() {
    var scriptName = "Advanced Tracking Data Export";
    var version = "1.0.0";

    // Utility function to convert radians to degrees
    function radiansToDegrees(radians) {
        return radians * (180 / Math.PI);
    }

    // Utility function to get matrix decomposition
    function decomposeTransform(matrix) {
        var scale = {
            x: Math.sqrt(matrix[0][0] * matrix[0][0] + matrix[0][1] * matrix[0][1]),
            y: Math.sqrt(matrix[1][0] * matrix[1][0] + matrix[1][1] * matrix[1][1])
        };

        var rotation = radiansToDegrees(Math.atan2(matrix[0][1], matrix[0][0]));

        var skew = {
            x: radiansToDegrees(Math.atan2(matrix[1][0], matrix[1][1])),
            y: radiansToDegrees(Math.atan2(-matrix[0][1], matrix[1][1]))
        };

        return {
            scale: scale,
            rotation: rotation,
            skew: skew
        };
    }

    // Function to get tracking data from motion trackers
    function getTrackerData(layer, time) {
        var trackerData = [];
        
        if (layer.motionTracker) {
            var tracker = layer.motionTracker;
            for (var i = 1; i <= tracker.numTrackPoints; i++) {
                var point = tracker.trackPoint(i);
                trackerData.push({
                    name: "Track Point " + i,
                    position: point.attach.valueAtTime(time, false),
                    confidence: point.confidence.valueAtTime(time, false)
                });
            }
        }
        
        return trackerData;
    }

    // Function to get mesh warp data
    function getMeshWarpData(layer, time) {
        var meshData = null;
        
        if (layer.effect.meshWarp) {
            var mesh = layer.effect.meshWarp;
            meshData = {
                rows: mesh.rows,
                columns: mesh.columns,
                vertices: []
            };
            
            for (var r = 0; r < mesh.rows; r++) {
                for (var c = 0; c < mesh.columns; c++) {
                    meshData.vertices.push({
                        row: r,
                        col: c,
                        position: mesh.vertex(r, c).valueAtTime(time, false)
                    });
                }
            }
        }
        
        return meshData;
    }

    // Main function to collect transform and tracking data
    function collectLayerData(layer, comp) {
        var layerData = {
            name: layer.name,
            index: layer.index,
            type: layer.matchName,
            frames: []
        };

        var totalFrames = Math.floor(comp.duration * comp.frameRate);
        
        for (var frame = 0; frame <= totalFrames; frame++) {
            var time = frame / comp.frameRate;
            
            // Get basic transform properties
            var position = layer.transform.position.valueAtTime(time, false);
            var anchorPoint = layer.transform.anchorPoint.valueAtTime(time, false);
            var scale = layer.transform.scale.valueAtTime(time, false);
            var rotation = layer.transform.rotation.valueAtTime(time, false);
            var opacity = layer.transform.opacity.valueAtTime(time, false);

            // Get layer transform matrix at current time
            var transform = layer.transform;
            var matrix = transform.value;

            // Decompose matrix to get additional transform data
            var decomposed = decomposeTransform(matrix);

            // Get corner pin data if available
            var cornerPin = null;
            if (layer.effect("Corner Pin")) {
                cornerPin = {
                    topLeft: layer.effect("Corner Pin")("Top Left").valueAtTime(time, false),
                    topRight: layer.effect("Corner Pin")("Top Right").valueAtTime(time, false),
                    bottomRight: layer.effect("Corner Pin")("Bottom Right").valueAtTime(time, false),
                    bottomLeft: layer.effect("Corner Pin")("Bottom Left").valueAtTime(time, false)
                };
            }

            // Get puppet pin data if available
            var puppetPins = [];
            if (layer.effect("Puppet").numProperties > 0) {
                var puppet = layer.effect("Puppet");
                for (var i = 1; i <= puppet.numProperties; i++) {
                    if (puppet.property(i).matchName === "ADBE FreePin3 PosPin") {
                        var pin = puppet.property(i);
                        puppetPins.push({
                            name: pin.name,
                            position: pin.position.valueAtTime(time, false)
                        });
                    }
                }
            }

            // Collect frame data
            var frameData = {
                frame: frame,
                time: time,
                transform: {
                    position: {
                        x: position[0],
                        y: position[1]
                    },
                    anchorPoint: {
                        x: anchorPoint[0],
                        y: anchorPoint[1]
                    },
                    scale: {
                        x: scale[0],
                        y: scale[1]
                    },
                    rotation: rotation,
                    opacity: opacity,
                    skew: decomposed.skew
                },
                cornerPin: cornerPin,
                puppetPins: puppetPins,
                trackerPoints: getTrackerData(layer, time),
                meshWarp: getMeshWarpData(layer, time)
            };

            layerData.frames.push(frameData);
        }

        return layerData;
    }

    // Function to collect composition data
    function collectCompData(comp) {
        var compData = {
            name: comp.name,
            duration: comp.duration,
            frameRate: comp.frameRate,
            width: comp.width,
            height: comp.height,
            layers: []
        };

        // Collect data for each layer
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            compData.layers.push(collectLayerData(layer, comp));
        }

        return compData;
    }

    // Function to export data to JSON file
    function exportToJSON(data, outputFile) {
        try {
            outputFile.open('w');
            outputFile.write(JSON.stringify(data, null, 2));
            outputFile.close();
            return true;
        } catch (error) {
            alert("Error writing file: " + error.toString());
            return false;
        }
    }

    // Main UI and execution
    function createUI() {
        var win = new Window("dialog", scriptName + " v" + version);
        
        // Add composition selector
        var compGroup = win.add("group");
        compGroup.add("statictext", undefined, "Composition:");
        var compList = compGroup.add("dropdownlist", undefined, getCompNames());
        compList.selection = 0;
        
        // Add buttons
        var btnGroup = win.add("group");
        var exportBtn = btnGroup.add("button", undefined, "Export");
        var cancelBtn = btnGroup.add("button", undefined, "Cancel");
        
        exportBtn.onClick = function() {
            var comp = app.project.item(compList.selection.index + 1);
            var outputFile = File.saveDialog("Save tracking data", "JSON:*.json");
            
            if (outputFile !== null) {
                var data = collectCompData(comp);
                if (exportToJSON(data, outputFile)) {
                    alert("Tracking data exported successfully!");
                }
            }
            win.close();
        };
        
        cancelBtn.onClick = function() {
            win.close();
        };
        
        win.center();
        win.show();
    }

    // Utility function to get composition names
    function getCompNames() {
        var items = app.project.items;
        var compNames = [];
        
        for (var i = 1; i <= items.length; i++) {
            if (items[i] instanceof CompItem) {
                compNames.push(items[i].name);
            }
        }
        
        return compNames;
    }

    // Check if project is open
    if (app.project === null) {
        alert("Please open a project first.");
        return;
    }

    // Launch UI
    createUI();
}());
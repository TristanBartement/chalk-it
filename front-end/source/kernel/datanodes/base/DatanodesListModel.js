﻿// ┌────────────────────────────────────────────────────────────────────┐ \\
// │ DatanodesListModel : fork from freeboard                           │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\

function DatanodesListModel(datanodePlugins, freeboardUI, datanodesDependency, timeManager) {
  var self = this;
  var storeData = []; //ABK

  this.datanodes = ko.observableArray();
  this.datasourceData = {};

  this.processDatanodeUpdate = function (datanodeName, newData) {
    self.datasourceData[datanodeName] = newData;
  };

  this.renameDatanodeData = function (oldName, newName) {
    self.datasourceData[newName] = self.datasourceData[oldName];
    delete self.datasourceData[oldName];
  };

  this._datanodeTypes = ko.observable();
  this.datanodeTypes = ko.computed({
    read: function () {
      self._datanodeTypes();

      var returnTypes = [];

      _.each(datanodePlugins, function (datanodePluginType) {
        var typeName = datanodePluginType.type_name;
        var displayName = typeName;

        if (!_.isUndefined(datanodePluginType.display_name)) {
          displayName = datanodePluginType.display_name;
        }

        returnTypes.push({
          name: typeName,
          display_name: displayName,
        });
      });

      return returnTypes;
    },
  });

  this.serialize = function () {
    var datanodes = [];

    _.each(self.datanodes(), function (datanode) {
      datanodes.push(datanode.serialize());
    });

    var $body = angular.element(document.body);
    var $rootScope = $body.scope().$root;
    $rootScope.alldatanodes = datanodesManager.getAllDataNodes();
    $rootScope.showNotifications = false;
    $rootScope.safeApply();
    return {
      datanodes: datanodes,
    };
  };

  this.deserialize = function (
    object,
    bClear,
    finishedCallback //ABK
  ) {
    var appendPosition = 0;
    if (bClear) {
      //ABK
      self.clear();
    }

    function finishLoad() {
      self.error = ko.observable(false); // MBG 09/07/2018. error better as ko observable
      storeData = []; //ABK
      var datanodes = [];

      if (_.isUndefined(object.datanodes)) {
        object.datanodes = object.datasources; //compatibility
        delete object.datasources;
      }

      for (let i = 0; i < object.datanodes.length; i++) {
        //compatibility
        if (object.datanodes[i].type === 'REST_web-service_from_datasource') {
          //object.datanodes[i].type = "REST_API";
        } else if (object.datanodes[i].type === 'FMI_web-service_from_datasource') {
          //object.datanodes[i].type = "FMI_API";
        } else if (object.datanodes[i].type === 'Map_matching_from_datasource') {
          //object.datanodes[i].type = "Map_matching";
        } else if (object.datanodes[i].type === 'Clock_web-service') {
          //object.datanodes[i].type = "Clock";
        } else if (object.datanodes[i].type === 'Generic_file_reader_plugin') {
          //object.datanodes[i].type = "Generic_text_file_reader";
        } else if (object.datanodes[i].type === 'Geolocation-plugin') {
          //object.datanodes[i].type = "Geolocation";
        }
      }

      datanodes = object.datanodes;

      //_.each(object.datanodes, function(datanodeConfig) // MBG for issue #41
      _.each(datanodes, function (datanodeConfig) {
        if (!_checkDatanodeExistance(datanodeConfig.name)) {
          if (!_createDatanodeInstance(datanodeConfig)) {
            return false;
          }
        } else {
          storeData.push(datanodeConfig); // MBG 11/07/2018: storeData has now datanodeConfig instead of datanodes
        }
      });

      if (storeData.length != 0) {
        //ABK
        displayDuplicateDataList();
      }

      // MBG scheduler refactoring
      if (self.datanodes().length > 0) {
        // AEF: case of dependencyStructure has nodes not defined as datanodes
        // this case is possible when in formula for example user define a datanodes that doesn't exist
        // and forget to create it later
        var bFound = false;
        var diff = Object.keys(datanodesDependency.dependencyStructure).length - datanodes.length; // always positif
        if (diff != 0) {
          for (var prop in datanodesDependency.dependencyStructure) {
            bFound = false;
            for (var j = 0; j < datanodes.length; j++) {
              if (prop === datanodes[j].name) {
                bFound = true;
                break;
              }
            }
            if (!bFound) {
              //datanodesDependency.removeNode(prop); // not removed but alert user of his mistake, scheduler can run now without problem
              var successors = Array.from(datanodesDependency.getSuccessors(prop));
              swal(
                'Missed dataNodes!',
                "'" +
                  prop +
                  "' is referenced in formula of '" +
                  successors +
                  "' but doesn't exist in list of datanodes",
                'error'
              );
              diff--;
            }
            if (diff == 0) {
              break; //all extra nodes are handled
            }
          }
        }
        //AEF
        var datanodes;
        var bFoundPeriodic = false;
        var bFoundNoPeriodic = false;
        var indexP = 0;
        var indexNP = 0;
        //for compatibility with older versions
        for (var i = 0; i < self.datanodes().length; i++) {
          datanodes = self.datanodes()[i];
          if (!_.isUndefined(datanodes.settings().refresh)) {
            //older name for clk, REST WS, FMI, Weather
            datanodes.settings().sampleTime = datanodes.settings().refresh;
            delete datanodes.settings().refresh;
          } else if (!_.isUndefined(datanodes.settings().refresh_time)) {
            //csvPlayer
            datanodes.settings().sampleTime = datanodes.settings().refresh_time;
            delete datanodes.settings().refresh_time;
          } else if (!_.isUndefined(datanodes.settings().refresh_rate)) {
            //websocket send
            datanodes.settings().sampleTime = datanodes.settings().refresh_rate;
            delete datanodes.settings().refresh_rate;
          } else if (!_.isUndefined(datanodes.settings().refreshRate)) {
            //geolocalisation
            datanodes.settings().sampleTime = datanodes.settings().refreshRate;
            delete datanodes.settings().refreshRate;
          }
        }
        //compute graphs after loading datanodes
        datanodesDependency.computeAllDisconnectedGraphs();
        //launch scheduler
        for (var i = 0; i < self.datanodes().length; i++) {
          datanodes = self.datanodes()[i];
          if (!_.isUndefined(datanodes.settings().sampleTime) && datanodes.settings().sampleTime != 0) {
            bFoundPeriodic = true;
            indexP = i;
            datanodes.sampleTime(datanodes.settings().sampleTime);
            timeManager.registerDatanode(datanodes.sampleTime(), datanodes.name(), 'globalFirstUpdate'); //to compute basePeriod
          } else {
            bFoundNoPeriodic = true;
            indexNP = i;
          }
        }
        if (bFoundPeriodic) {
          datanodes = self.datanodes()[indexP];
          timeManager.registerDatanode(datanodes.sampleTime(), datanodes.name()); //to launch Timer
        }
        if (bFoundNoPeriodic) {
          datanodes = self.datanodes()[indexNP];
          self.launchGlobalFirstUpdate(datanodes); //launch all datanodes P and NP (see modif AEF 23/11/20)
        }
      }

      if (_.isFunction(finishedCallback)) {
        finishedCallback();
      }

      return true; //ABK
    }

    finishLoad();
    if (self.error()) return false;
    else return true;
  };

  // MBG refactoring
  function _createDatanodeInstance(datanodeConfig) {
    var datanodes = new DatanodeModel(self, datanodePlugins, datanodesDependency, timeManager);
    if (!datanodes.deserialize(datanodeConfig)) {
      self.error(true);
      return false;
    }
    self.addDatanode(datanodes);
    return true;
  }

  function displayDuplicateDataList() {
    var contentElement = xdsjson.getDuplicateDataList(
      storeData,
      'Please check data to be loaded after choosing rename or overwite option'
    );

    new DialogBoxForDuplicateData(contentElement, 'List of duplicate data name', 'Load', 'Close', function () {
      var i = 0;
      // MBG 11/07/2018 : first rename all
      for (i = 0; i < storeData.length; i++) {
        if ($('#data-checkbox-' + i).is(':checked')) {
          storeData[i].name = $('#data-check-' + i)[0].value;
        }
      }
      for (i = 0; i < storeData.length; i++) {
        if ($('#data-checkbox-' + i).is(':checked')) {
          storeData[i].name = $('#data-check-' + i)[0].value;
          if ($('#data-rename-' + i).is(':checked')) {
            //add new one
            _createDatanodeInstance(storeData[i]); // MBG 11/07/2018
          } else {
            //overwrite
            for (var j = 0; j < self.datanodes().length; j++) {
              if (self.datanodes()[j].name() == storeData[i].name) {
                self.deleteDatanode(self.datanodes()[j]); // MBG 11/07/2018
                self.datanodes.remove(self.datanodes()[j]); // MBG added 01/08/2018
                _createDatanodeInstance(storeData[i]); // MBG 11/07/2018
                break;
              }
            }
          }
        }
      }
    });
  }

  this.launchGlobalFirstUpdate = function (datanode) {
    var sourceNodes = datanodesDependency.getSourceNodes();
    if (sourceNodes.length != 0) {
      //AEF: only if no-periodic datanodes exist as a startnodes
      datanode.schedulerStart(sourceNodes, sourceNodes[0], 'globalFirstUpdate');
    }
  };

  this.clear = function () {
    if (Object.keys(datanodesDependency.getExtraStartNodes()).length) {
      datanodesDependency.clearExtraStartNodes();
    }

    _.each(self.datanodes(), function (datanode) {
      self.deleteDatanode(datanode);
    });
    //AEF: case of dependencyStructure has nodes not defined as datanodes
    // this case is possible when in formula for example user define a datanode that doesn't exist
    // and forget to create it later
    if (Object.keys(datanodesDependency.dependencyStructure).length) {
      for (var prop in datanodesDependency.dependencyStructure) {
        datanodesDependency.removeNode(prop);
        console.log('extra nodes are deleted');
      }
    }
    datanodesDependency.resetGraphList();
    self.datanodes.removeAll();
  };

  this.load = function (dashboardData, bClear, callback) {
    freeboardUI.showLoadingIndicator(true);
    self.deserialize(dashboardData, bClear, function () {
      freeboardUI.showLoadingIndicator(false);

      if (_.isFunction(callback)) {
        callback();
      }

      if (self.error())
        //ABK
        return false;
      else return true;
    });
  };

  function _checkDatanodeExistance(datanodeName) {
    var bFound = false;
    for (var i = 0; i < self.datanodes().length; i++) {
      bFound = false;
      if (self.datanodes()[i].name() == datanodeName) {
        bFound = true;
        break;
      }
    }
    if (!bFound) {
      return false;
    } else {
      return true;
    }
  }

  this.addDatanode = function (datanodes) {
    //ABK: add verification of data existance
    var bFound = false;
    for (var i = 0; i < self.datanodes().length; i++) {
      bFound = false;
      if (self.datanodes()[i].name() == datanodes.name()) {
        bFound = true;
        break;
      }
    }
    if (!bFound) {
      self.datanodes.unshift(datanodes); //AEF: Add items to the beginning of array
    }
  };

  this.deleteDatanode = function (datanodes) {
    var dsName = datanodes.name();
    delete self.datasourceData[dsName];
    datanodes.dispose();
  };
}

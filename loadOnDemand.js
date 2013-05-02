(function () {
    var module = angular.module('loadOnDemand', []);

    module.factory('scriptCache', ['$cacheFactory', function ($cacheFactory) {
        return $cacheFactory('scriptCache', {
            capacity: 10
        });
    } ]);

    module.provider('$loadOnDemand', ['$controllerProvider', '$provide', '$compileProvider', '$filterProvider', function ($controllerProvider, $provide, $compileProvider, $filterProvider) {
        var modules = {};
        this.$get = ['scriptCache', '$controller', '$timeout', '$log', function (scriptCache, $controller, $timeout, $log) {
            return {            
                getConfig: function(name) {
                    if (!modules[name]) {
                        var errorText = 'Module "' + name + '" not configured';
                        $log.error(errorText);
                        throw Error(errorText);
                    }
                    return modules[name];
                },
                load: function(name, callback) {
                    var self = this;
                    var config = self.getConfig(name);
                    var needRegister = [];

                    var resourceId = 'script:' + config.script;
                    if (!scriptCache.get(resourceId)) {
                        loadScript(config.script, function() {
                            needRegister.push(name);
                            loadDependencies(name, function () {
                                register(needRegister);
                                $timeout(function() {
                                    callback(false);
                                });
                            });

                        });
                    } else {
                        $timeout(function() {
                            callback(true);
                        });
                    }

                    function register(registerModules) {
                        if (registerModules) {
                            for (var k = 0; k < registerModules.length; k++) {
                                var moduleName = registerModules[k];

                                var moduleFn = angular.module(moduleName);
                                try {
                                    for (var invokeQueue = moduleFn._invokeQueue, i = 0, ii = invokeQueue.length; i < ii; i++) {
                                        var invokeArgs = invokeQueue[i];
                                        var provider = null;

                                        switch (invokeArgs[0]) {
                                            case '$controllerProvider':
                                                provider = $controllerProvider;
                                                break;
                                            case '$compileProvider':
                                                provider = $compileProvider;
                                                break;
                                            case '$filterProvider':
                                                provider = $filterProvider;
                                                break;
                                            case '$provide':
                                                provider = $provide;
                                                break;
                                            default:
                                                throw "unsupported provider " + invokeArgs[0];
                                        }
                                        provider[invokeArgs[1]].apply(provider, invokeArgs[2]);
                                    }
                                } catch(e) {
                                    if (e.message) e.message += ' from ' + module;
                                    throw e;
                                }
                            }
                        }
                    }

                    function loadScript(url, callback) {
                        var resourceId = 'script:' + url;
                        if (!scriptCache.get(resourceId)) {
                            var scriptElement = document.createElement('script');
                            scriptElement.src = url;
                            scriptElement.onload = callback;
                            scriptElement.onerror = function() {
                                $log.error('Error loading "' + script + '"');
                                scriptCache.remove(resourceId);
                            };
                            document.documentElement.children[0].appendChild(scriptElement);
                            scriptCache.put(resourceId, 1);
                        } else {
                            $timeout(callback);
                        }
                    }

                    function loadDependencies(moduleName, allDependencyLoad) {
                        var loadedModule = angular.module(moduleName);
                        var requires = [];
                        angular.forEach(loadedModule.requires, function(name) {
                            try {
                                angular.module(name);
                            } catch(e) {
                                if (/No module/.test(e)) {
                                    requires.push(name);
                                }
                            }
                        });
                        angular.forEach(requires, function(name) {
                            var config = self.getConfig(name);
                            loadScript(config.script, function () {
                                loadedCallback(name);
                            });
                        });

                        var loadedCallback = function (moduleLoaded) {
                            if (moduleLoaded) {
                                needRegister.push(moduleLoaded);

                                var index = requires.indexOf(moduleLoaded);
                                if (index > -1) {
                                    requires.splice(index, 1);
                                }
                            }
                            if (requires.length == 0) {
                                allDependencyLoad();
                            }
                        };

                        loadedCallback();
                    }

                },
            };
        }];
        this.config = function(config) {
            if (angular.isArray(config)) {
                angular.forEach(config, function(moduleConfig) {
                    modules[moduleConfig.name] = moduleConfig;
                });
            } else {
                modules[config.name] = config;
            }
        };
    }]);

    module.directive('loadOnDemand',
                ['$http', 'scriptCache', '$log', '$loadOnDemand', '$compile', '$templateCache', '$injector', '$timeout',
        function ($http, scriptCache, $log, $loadOnDemand, $compile, $templateCache, $injector, $timeout) {
            return {
                restrict: 'ECA',
                terminal: true,
                scope: false,
                compile: function (elm, attr) {
                    var srcExp = attr.loadOnDemand;

                    var postlinkFn = function (scope, element) {
                        var childScope;

                        var clearContent = function () {
                            if (childScope) {
                                childScope.$destroy();
                                childScope = null;
                            }

                            element.html('');
                        };

                        scope.$watch(srcExp, function (moduleName) {
                            var moduleConfig = $loadOnDemand.getConfig(moduleName);

                            if (moduleName) {
                                $loadOnDemand.load(moduleName, function (fromCache) {
                                    if (!moduleConfig.template)
                                        return;
                                    
                                    loadTemplate(moduleConfig.template, function (response) {
                                        
                                        childScope = scope.$new();

                                        element.html(response);

                                        var content = element.contents();
                                        var linkFn = $compile(content);
                                        linkFn(childScope);

                                    });
                                    
                                });
                            } else clearContent();
                        });

                        function loadTemplate(url, callback) {
                            var resourceId = 'view:' + url;
                            if (!scriptCache.get(resourceId)) {
                                $http.get(url).
                                    success(function (data) {
                                        scriptCache.put(resourceId, data);
                                        callback(data);
                                    });
                            } else {
                                var view = scriptCache.get(resourceId);
                                $timeout(function () {
                                    callback(view);
                                }, 0);
                            }
                        };
                    };
                    return postlinkFn;
                }
            };
        } ]);
})();



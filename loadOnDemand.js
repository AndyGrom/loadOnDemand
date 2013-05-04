/*global angular*/
(function () {
    'use strict';
    var regModules = ["ng"];
    
    var module = angular.module('loadOnDemand', []);

    module.factory('scriptCache', ['$cacheFactory', function ($cacheFactory) {
        return $cacheFactory('scriptCache', {
            capacity: 10
        });
    } ]);

    module.provider('$loadOnDemand',
        ['$controllerProvider', '$provide', '$compileProvider', '$filterProvider',
            function ($controllerProvider, $provide, $compileProvider, $filterProvider) {
                
                var modules = { },
                    providers = {
                        $controllerProvider: $controllerProvider,
                        $compileProvider: $compileProvider,
                        $filterProvider: $filterProvider,
                        $provide: $provide // other things
                    };
                this.$get = ['scriptCache', '$timeout', '$log', '$document',
                    function (scriptCache, $timeout, $log, $document) {
                        return {
                            getConfig: function (name) {
                                if (!modules[name]) {
                                    return null;
                                }
                                return modules[name];
                            },
                            load: function (name, callback) {
                                var self = this,
                                    config = self.getConfig(name),
                                    resourceId = 'script:' + config.script,
                                    modules = [];
                                modules.push = function(value) {
                                    if (this.indexOf(value) == -1) {
                                        Array.prototype.push.apply(this, arguments);
                                    }
                                };
                                if (!config) {
                                    var errorText = 'Module "' + name + '" not configured';
                                    $log.error(errorText);
                                    throw errorText;
                                }

                                function loadScript(url, onLoadScript) {
                                    var scriptId = 'script:' + url,
                                        scriptElement;
                                    if (!scriptCache.get(scriptId)) {
                                        scriptElement = $document[0].createElement('script');
                                        scriptElement.src = url;
                                        scriptElement.onload = onLoadScript;
                                        scriptElement.onerror = function () {
                                            $log.error('Error loading "' + url + '"');
                                            scriptCache.remove(scriptId);
                                        };
                                        $document[0].documentElement.appendChild(scriptElement);
                                        scriptCache.put(scriptId, 1);
                                    } else {
                                        $timeout(onLoadScript);
                                    }
                                }

                                function loadDependencies(moduleName, allDependencyLoad) {
                                    if (regModules.indexOf(moduleName) > -1) {
                                        return allDependencyLoad();
                                    }
                                    var loadedModule = angular.module(moduleName),
                                        requires = getRequires(loadedModule);
                                    function onModuleLoad(moduleLoaded) {
                                        if (moduleLoaded) {

                                            var index = requires.indexOf(moduleLoaded);
                                            if (index > -1) {
                                                requires.splice(index, 1);
                                            }
                                        }
                                        if (requires.length === 0) {
                                            allDependencyLoad();
                                        }
                                    }

                                    angular.forEach(getRequires(loadedModule), function (requireModule) {
                                        modules.push(requireModule);
                                        var requireModuleConfig = self.getConfig(requireModule);
                                        if (requireModuleConfig) {
                                            loadScript(requireModuleConfig.script, function() {
                                                loadDependencies(requireModule, function () {
                                                    onModuleLoad(requireModule);
                                                });
                                            });
                                        } else {
                                            if (moduleExists(requireModule)) {
                                                loadDependencies(requireModule, function() {
                                                    onModuleLoad(requireModule);
                                                });
                                            } else {
                                                $log.warn('module "' + requireModule +"' not loaded and not configured");
                                                onModuleLoad(regModules);
                                            }
                                        }
                                    });

                                    onModuleLoad();
                                }

                                if (!scriptCache.get(resourceId)) {
                                    loadScript(config.script, function () {
                                        modules.push(name);
                                        loadDependencies(name, function () {
                                            register(providers, modules);
                                            $timeout(function () {
                                                callback(false);
                                            });
                                        });

                                    });
                                } else {
                                    $timeout(function () {
                                        callback(true);
                                    });
                                }
                            }
                        };
                    }];
                this.config = function (config, registeredModules) {
                    if (angular.isArray(config)) {
                        angular.forEach(config, function (moduleConfig) {
                            modules[moduleConfig.name] = moduleConfig;
                        });
                    } else {
                        modules[config.name] = config;
                    }
                    if (registeredModules) {
                        angular.forEach(registeredModules, function(name) {
                            regModules.push(name);
                        });
                    }
                };
            }]);

    module.directive('loadOnDemand', ['$http', 'scriptCache', '$log', '$loadOnDemand', '$compile', '$timeout',
        function ($http, scriptCache, $log, $loadOnDemand, $compile, $timeout) {
            return {
                link: function (scope, element, attr) {
                    var srcExp = attr.loadOnDemand,
                        childScope;

                    function clearContent() {
                        if (childScope) {
                            childScope.$destroy();
                            childScope = null;
                        }
                        element.html('');
                    }

                    function loadTemplate(url, callback) {
                        var resourceId = 'view:' + url,
                            view;
                        if (!scriptCache.get(resourceId)) {
                            $http.get(url).
                                success(function(data) {
                                    scriptCache.put(resourceId, data);
                                    callback(data);
                                })
                                .error(function(data) {
                                    $log.error('Error load template "' + url + "': " + data);
                                });
                        } else {
                            view = scriptCache.get(resourceId);
                            $timeout(function() {
                                callback(view);
                            }, 0);
                        }
                    }

                    scope.$watch(srcExp, function(moduleName) {
                        var moduleConfig = $loadOnDemand.getConfig(moduleName);

                        if (moduleName) {
                            $loadOnDemand.load(moduleName, function() {
                                if (!moduleConfig.template) {
                                    return;
                                }
                                loadTemplate(moduleConfig.template, function(response) {

                                    childScope = scope.$new();
                                    element.html(response);

                                    var content = element.contents(),
                                        linkFn = $compile(content);

                                    linkFn(childScope);
                                });

                            });
                        } else {
                            clearContent();
                        }
                    });

                }
            };
        }]);
    
    function getRequires(module) {
        var requires = [];
        angular.forEach(module.requires, function (requireModule) {
            if (regModules.indexOf(requireModule) == -1) {
                requires.push(requireModule);
            }
        });
        return requires;
    }
    function moduleExists(moduleName) {
        try {
            angular.module(moduleName);
        } catch (e) {
            if (/No module/.test(e)) {
                return false;
            }
        }
        return true;
    }
    function register(providers, registerModules) {
        var i, ii, k, invokeQueue, moduleName, moduleFn, invokeArgs, provider;
        if (registerModules) {
            for (k = 0; k < registerModules.length; k++) {
                moduleName = registerModules[k];
                moduleFn = angular.module(moduleName);
                regModules.push(moduleName);
                try {
                    for (invokeQueue = moduleFn._invokeQueue, i = 0, ii = invokeQueue.length; i < ii; i++) {
                        invokeArgs = invokeQueue[i];

                        if (providers.hasOwnProperty(invokeArgs[0])) {
                            provider = providers[invokeArgs[0]];
                        } else {
                            return $log.error("unsupported provider " + invokeArgs[0]);
                        }
                        provider[invokeArgs[1]].apply(provider, invokeArgs[2]);
                    }
                } catch (e) {
                    if (e.message) {
                        e.message += ' from ' + moduleName;
                    }
                    $log.error(e.message);
                    throw e;
                }
            }
        }
        return null;
    }

})();



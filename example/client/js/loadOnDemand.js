/*global angular*/
(function () {
    'use strict';
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
                        $provide: $provide,
                        $compileProvider: $compileProvider,
                        $filterProvider: $filterProvider
                    };
                this.$get = ['scriptCache', '$timeout', '$log',
                    function (scriptCache, $timeout, $log) {
                        return {
                            getConfig: function (name) {
                                if (!modules[name]) {
                                    var errorText = 'Module "' + name + '" not configured';
                                    $log.error(errorText);
                                }
                                return modules[name];
                            },
                            load: function (name, callback) {
                                var self = this,
                                    config = self.getConfig(name),
                                    needRegister = [],
                                    resourceId = 'script:' + config.script;

                                function register(registerModules) {
                                    var i, ii, k, invokeQueue, moduleName, moduleFn, invokeArgs, provider;
                                    if (registerModules) {
                                        for (k = 0; k < registerModules.length; k++) {
                                            moduleName = registerModules[k];
                                            moduleFn = angular.module(moduleName);
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

                                function loadScript(url, onLoadScript) {
                                    var scriptId = 'script:' + url,
                                        scriptElement;
                                    if (!scriptCache.get(scriptId)) {
                                        scriptElement = window.document.createElement('script');
                                        scriptElement.src = url;
                                        scriptElement.onload = onLoadScript;
                                        scriptElement.onerror = function () {
                                            $log.error('Error loading "' + url + '"');
                                            scriptCache.remove(scriptId);
                                        };
                                        document.documentElement.children[0].appendChild(scriptElement);
                                        scriptCache.put(scriptId, 1);
                                    } else {
                                        $timeout(onLoadScript);
                                    }
                                }

                                function loadDependencies(moduleName, allDependencyLoad) {
                                    var loadedModule = angular.module(moduleName),
                                        requires = [],
                                        loadedCallback = function (moduleLoaded) {
                                            if (moduleLoaded) {
                                                needRegister.push(moduleLoaded);

                                                var index = requires.indexOf(moduleLoaded);
                                                if (index > -1) {
                                                    requires.splice(index, 1);
                                                }
                                            }
                                            if (requires.length === 0) {
                                                allDependencyLoad();
                                            }
                                        };
                                    angular.forEach(loadedModule.requires, function (requireModule) {
                                        try {
                                            angular.module(requireModule);
                                        } catch (e) {
                                            if (/No module/.test(e)) {
                                                requires.push(requireModule);
                                            }
                                        }
                                    });
                                    angular.forEach(requires, function (requireModule) {
                                        var requireModuleConfig = self.getConfig(requireModule);
                                        loadScript(requireModuleConfig.script, function () {
                                            loadedCallback(requireModule);
                                        });
                                    });

                                    loadedCallback();
                                }

                                if (!scriptCache.get(resourceId)) {
                                    loadScript(config.script, function () {
                                        needRegister.push(name);
                                        loadDependencies(name, function () {
                                            register(needRegister);
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
                this.config = function (config) {
                    if (angular.isArray(config)) {
                        angular.forEach(config, function (moduleConfig) {
                            modules[moduleConfig.name] = moduleConfig;
                        });
                    } else {
                        modules[config.name] = config;
                    }
                };
            }]);

    module.directive('loadOnDemand', ['$http', 'scriptCache', '$log', '$loadOnDemand', '$compile', '$timeout',
        function ($http, scriptCache, $log, $loadOnDemand, $compile, $timeout) {
            return {
                restrict: 'ECA',
                terminal: true,
                scope: false,
                compile: function(elm, attr) {
                    var srcExp = attr.loadOnDemand,
                        postlinkFn = function (scope, element) {
                            var childScope;

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
                                        success(function (data) {
                                            scriptCache.put(resourceId, data);
                                            callback(data);
                                        })
                                        .error(function (data) {
                                            $log.error('Error load template "' + url + "': " + data);
                                        });
                                } else {
                                    view = scriptCache.get(resourceId);
                                    $timeout(function () {
                                        callback(view);
                                    }, 0);
                                }
                            }

                            scope.$watch(srcExp, function (moduleName) {
                                var moduleConfig = $loadOnDemand.getConfig(moduleName);

                                if (moduleName) {
                                    $loadOnDemand.load(moduleName, function () {
                                        if (!moduleConfig.template) {
                                            return;
                                        }
                                        loadTemplate(moduleConfig.template, function (response) {

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

                        };
                    return postlinkFn;
                }
            };
        }]);
})();



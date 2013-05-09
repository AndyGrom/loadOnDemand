/*global angular*/
(function () {
    'use strict';
    var regModules = ["ng"];
    
    var aModule = angular.module('loadOnDemand', []);

    aModule.factory('scriptCache', ['$cacheFactory', function ($cacheFactory) {
        return $cacheFactory('scriptCache', {
            capacity: 10
        });
    } ]);

    aModule.provider('$loadOnDemand',
        ['$controllerProvider', '$provide', '$compileProvider', '$filterProvider',
            function ($controllerProvider, $provide, $compileProvider, $filterProvider) {
                
                var modules = { },
                    providers = {
                        $controllerProvider: $controllerProvider,
                        $compileProvider: $compileProvider,
                        $filterProvider: $filterProvider,
                        $provide: $provide // other things
                    };
                this.$get = ['scriptCache', '$timeout', '$log', '$document', '$injector',
                    function (scriptCache, $timeout, $log, $document, $injector) {
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
                                    moduleCache = [];
                                moduleCache.push = function (value) {
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
                                            $timeout(function () {
                                                allDependencyLoad(moduleName);
                                            });
                                        }
                                    }

                                    var requireNeeded = getRequires(loadedModule);
                                    angular.forEach(requireNeeded, function (requireModule) {
                                        moduleCache.push(requireModule);
                                        
                                        if (moduleExists(requireModule)) {
                                            return onModuleLoad(requireModule);
                                        }
                                        
                                        var requireModuleConfig = self.getConfig(requireModule);
                                        if (requireModuleConfig) {
                                            loadScript(requireModuleConfig.script, function() {
                                                loadDependencies(requireModule, function requireModuleLoaded(name) {
                                                    onModuleLoad(name);
                                                });
                                            });
                                        } else {
                                            $log.warn('module "' + requireModule + "' not loaded and not configured");
                                            onModuleLoad(requireModule);
                                        }
                                        return null;
                                    });

                                    if (requireNeeded.length == 0) {
                                        onModuleLoad();
                                    }
                                    return null;
                                }

                                if (!scriptCache.get(resourceId)) {
                                    loadScript(config.script, function () {
                                        moduleCache.push(name);
                                        loadDependencies(name, function () {
                                            register($injector, providers, moduleCache);
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
                    init(angular.element(window.document));
                    if (angular.isArray(config)) {
                        angular.forEach(config, function (moduleConfig) {
                            modules[moduleConfig.name] = moduleConfig;
                        });
                    } else {
                        modules[config.name] = config;
                    }
                };
            }]);

    aModule.directive('loadOnDemand', ['$http', 'scriptCache', '$log', '$loadOnDemand', '$compile', '$timeout',
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
                                loadTemplate(moduleConfig.template, function(template) {

                                    childScope = scope.$new();
                                    element.html(template);

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
    function register($injector, providers, registerModules) {
        var i, ii, k, invokeQueue, moduleName, moduleFn, invokeArgs, provider;
        if (registerModules) {
            var runBlocks = [];
            for (k = registerModules.length-1; k >= 0; k--) {
                moduleName = registerModules[k];
                regModules.push(moduleName);
                moduleFn = angular.module(moduleName);
                runBlocks = runBlocks.concat(moduleFn._runBlocks);
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
                registerModules.pop();
            }
            angular.forEach(runBlocks, function(fn) {
                $injector.invoke(fn);
            });
        }
        return null;
    }
    
    function init(element) {
        var elements = [element],
            appElement,
            module,
            names = ['ng:app', 'ng-app', 'x-ng-app', 'data-ng-app'],
            NG_APP_CLASS_REGEXP = /\sng[:\-]app(:\s*([\w\d_]+);?)?\s/;

        function append(elm) {
            elm && elements.push(elm);
        }

        angular.forEach(names, function (name) {
            names[name] = true;
            append(document.getElementById(name));
            name = name.replace(':', '\\:');
            if (element.querySelectorAll) {
                angular.forEach(element.querySelectorAll('.' + name), append);
                angular.forEach(element.querySelectorAll('.' + name + '\\:'), append);
                angular.forEach(element.querySelectorAll('[' + name + ']'), append);
            }
        });

        angular.forEach(elements, function (elm) {
            if (!appElement) {
                var className = ' ' + element.className + ' ';
                var match = NG_APP_CLASS_REGEXP.exec(className);
                if (match) {
                    appElement = elm;
                    module = (match[2] || '').replace(/\s+/g, ',');
                } else {
                    angular.forEach(elm.attributes, function (attr) {
                        if (!appElement && names[attr.name]) {
                            appElement = elm;
                            module = attr.value;
                        }
                    });
                }
            }
        });
        if (appElement) {
            (function addReg(module) {
                if (regModules.indexOf(module) == -1) {
                    regModules.push(module);
                    var mainModule = angular.module(module);
                    angular.forEach(mainModule.requires, addReg);
                }
            })(module);
        }
    }

})();



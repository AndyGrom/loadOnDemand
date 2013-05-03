angular.module('app', ['loadOnDemand'])
    .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {
        $locationProvider.hashPrefix('!');
        $routeProvider
            .when('/home', { template: '<h1>HomePage</h1>' })
            .when('/demand', { template: '<div load-on-demand="\'demand\'"></div>' })
            .otherwise({ redirectTo: '/home' });

    }])
    .config(['$loadOnDemandProvider', function ($loadOnDemandProvider) {
        var modules = [
            {
                name: 'demand',
                script: 'js/modules/demand.js',
                template: 'template/demand.html'
            },
            {
                name: 'ui',
                script: 'js/angular-ui.js'
            },
            {
                name: 'dependence',
                script: 'js/modules/dependence.js'
            }
        ];

        $loadOnDemandProvider.config(modules);
    }]);


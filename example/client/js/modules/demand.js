angular.module('demand', ['dependence'])
    .controller('demand', ['$scope', function ($scope) {
        $scope.header = 'load on demand controller';
    }]);
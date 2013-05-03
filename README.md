loadOnDemand
============

Load on demand angularjs modules. Angularjs module is designed to download other modules angularjs when they need them

Using
-----
Put loadOnDemand.js into you project:

```html
<script src="loadOnDemand.js"></script>
```
Specify dependence loadOnDemand module for your application:

```javascript
var app = angular.module('app', ['loadOnDemand']);
```

Configure the service provider $loadOnDemandProvider

```javascript
app.config(['$loadOnDemandProvider', function ($loadOnDemandProvider) {
	var modules = [
        {
            name: 'module_name',		// name of module
            script: 'js/module_name.js' // path to javascript file
        }
	];
	$loadOnDemandProvider.config(modules);
}]);
```

When will need to download the module, enter it in the markup by the directive load-on-demand:

```html
<div load-on-demand="'module_name'"></div>
```

See the example in the folder 'example'
loadOnDemand
============

Load on demand angularjs modules. Angularjs module is designed to download other modules angularjs when they need them (lazy load).

Key features
------------
1. Dependencies are automatically loaded
2. Debugger like ( no eval code )
3. The ability to mix normal boot and load on demand

Using
-----
1. Put loadOnDemand.js into you project:

   ```html
   <script src="loadOnDemand.js"></script>
   ```
2. Specify dependence loadOnDemand module for your application:

   ```javascript
   var app = angular.module('app', ['loadOnDemand']);
   ```

3. Configure the service provider $loadOnDemandProvider

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

4. When will need to download the module, enter it in the markup by the directive load-on-demand:

   ```html
   <div load-on-demand="'module_name'"></div>
   ```

you can load a list of modules

   ```html
   <div load-on-demand="['module_name','module_name2']"></div>
   ```


See the example in the folder 'example'

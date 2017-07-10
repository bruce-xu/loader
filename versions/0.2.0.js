/**
 * @fileoverview JS AMD 规范加载器（第一版，实现最基本功能）
 * @author brucexyj@gmail.com
 */
(function (root) {
  // 保存所有加载过的模块
  var modules = {};
  // 当前解析的文件中已经加载到的模块（正常情况下，每个文件中只会定义一个模块，
  // 则此数组中只会有一个值；但某些情况，如打包后，多个文件打包成一个，
  // 此时文件中包含了多个模块定义，此变量主要处理此种场景）
  var loadedModules = {};
  // 模块状态
  var modStatus = ['init', 'loaded', 'ready'];
  // 用于给调用 require 函数产生的内部模块命名
  var requireModuleIndex = 0;

  var timeoutHandler = null;

  function Empty() {}

  /**
   * 加载依赖模块，并执行回调函数（一般作为程序入口）
   *
   * @param {Array.<string>} deps 依赖的模块列表
   * @param {Function} callback require的回调函数
   */
  function require(deps, callback) {
    // 限定deps参数必须是个数组
    if (!(deps instanceof Array)) {
      throw new Error('Param "deps" must be an Array.');
    }

    // 限定 callback 参数如果有值，则必须是个函数
    if (callback && typeof callback !== 'function') {
      throw new Error('Param "func" must be a function.');
    }

    // 当我们调用 require(['xxx'], function () {xxx}) 时，本意是引用'xxx'模块，是模块的消费者，并非要定义模块，
    // 和 define(['xxxx'], function () {xxxx}) 是有区别的，后者才是定义模块。但为了提取共性，处理方便，
    // 此处将 require 函数调用，也看成是定义模块，只不过此处的“模块”不会被外部引用到，所以设置了私有的名字。
    var name = '__requireModel__' + requireModuleIndex++;
    initModule({
      name: name,
      parents: null
    });

    actualRequire(name, deps, callback);
  }

  /**
   * 定义一个模块
   *
   * @param {string?} id 模块名
   * @param {Array.<string>?} deps 依赖的模块列表
   * @param {Function} factory 模块定义函数
   */
  function define(id, deps, factory) {
    // 由于 id 和 deps 参数都是可选的，所以此处需要处理一下参数
    if (!factory) {
      if (!deps) {
        // 如 define(function() {xxxx})
        factory = id;
        id = null;
        deps = [];
      } else {
        factory = deps;

        if (id instanceof Array) {
          // 如 define([deps], function(deps) {xxxx})
          deps = id;
          id = null;
        } else {
          // 如 define(id, function() {xxxx})
          deps = [];
        }
      }
    }

    // 可以定义一个对象作为模块的返回值。为了统一处理，此处将此场景转换成定义模块函数内返回对象
    if (typeof factory === 'object') {
      value = factory;
      factory = function () {
        return value;
      };
    }

    // id 可以不传（实践中也不建议传），如果有传递的话，必须是字符串
    if (id && typeof id !== 'string') {
      throw new Error('Param "id" must be a string. The correct parameters like "define([id, [deps, ]]factory)"');
    }

    // 限制deps参数必须是数组
    if (!(deps instanceof Array)) {
      throw new Error('Param "deps" must be an array. The correct parameters like "define([id, [deps, ]]factory)"');
    }

    // 限制 factory 参数必须是函数
    if (typeof factory !== 'function') {
      throw new Error('Param "factory" must be a function. The correct parameters like "define([id, [deps, ]]factory)"');
    }

    // 获取当前模块
    var name = id;
    if (!name) {
      var currentScript = getCurrentScript();
      name = currentScript.getAttribute('data-module');
    }

    // 当前文件内如果只定义了一个模块（开发时应该这样做），则既然当前文件已经被加载到，说明其它模块中依赖了此模块，
    // 在加载依赖处肯定已经初始化了此模块，此场景 modules[name] 是存在的；
    // 另一场景是多个模块被打包到了一个文件，此时执行 define 函数定义模块时，当前模块并不一定已经被其它模块依赖过，
    // 所以此时 modules[name] 可能是不存在的，需要做初始化操作。
    if (!modules[name]) {
      initModule({
        name: name,
        parents: []
      });
    }

    actualRequire(name, deps, factory);
  }

  /**
   * 实际调用的模块加载函数（require 和 define 本质都是一样的：依赖一些模块，待依赖模块加载完成后，执行回调函数。
   * 所以实际调用的都是这个函数）
   *
   * @param {string} name 当前正在解析的模块名
   * @param {Array.<string>} deps 依赖的模块列表
   * @param {Function} factory 模块定义函数
   */
  function actualRequire(name, deps, factory) {
    loadedModules[name] = true;

    // 更新模块状态
    updateModule(name, {
      status: 'loaded',
      deps: deps,
      factory: factory
    });

    // 当前模块依赖其他模块，需要一一加载它们，并等到依赖的其他模块都就绪后，当前模块才能就绪
    if (deps.length) {
      for (var i = 0, len = deps.length; i < len; i++) {
        var depName = deps[i];
        if (!modules[depName]) {
          // 还未有其他模块引用过此依赖模块，此场景可以直接加载此依赖模块
          initModule({
            name: depName,
            parents: [name]
          });
        } else {
          // 此依赖模块已被其他模块依赖并加载（可能当前已就绪，也可能当前正在加载中），此场景需更新模块间的父子关系
          modules[depName].parents.push(name);
        }
      }
    }

    
    checkBatchModulesReady();
  }

  /**
   * 初始化模块
   * 
   * @param {Object} options 初始化参数
   */
  function initModule(options) {
     var initOptions = {
      name: '',
      parents: null,
      status: 'init',
      deps: [],
      value: null,
      factory: Empty
    };

    modules[options.name] = extend(initOptions, options);
  }

  /**
   * 更新模块
   *
   * @param {string} name 模块名字
   * @param {Object} options 模块参数 
   */
  function updateModule(name, options) {
    var mod = modules[name];
    if (mod) {
      extend(mod, options);
    }
  }

  function loadModuleDeps(name) {
    var deps = modules[name].deps;

    if (deps.length) {
      for (var i = 0, len = deps.length; i < len; i++) {
        var dep = deps[i];
        if (!modules[dep]) {
          // 还未有其他模块引用过此依赖模块，此场景可以直接加在此依赖模块
          initModule({
            name: dep,
            parents: [name]
          });

          createScript(dep);
        } else if (modules[dep].status === 'init') {
          createScript(dep);
        } else {
          // 此依赖模块已被其他模块依赖并加载（可能当前已就绪，也可能当前正在加载中），此种场景需更新模块间的父子关系
          modules[dep].parents.push(name);
        }
      }
    }
  }

  /**
   * 检查模块是否就绪
   *
   * @param {string} name 待检查的模块
   */
  function checkModuleReady(name) {
    var deps = modules[name].deps;

    for (var i = 0, len = deps.length; i < len; i++) {
      var dep = modules[deps[i]];
      // 如果有依赖的模块没有就绪，则当前模块肯定不会就绪
      if (dep.status !== 'ready') {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查当前文件内定义的模块（可能有多个）是否就绪
   */
  function checkBatchModulesReady() {
    // 清除上一个 timeout
    clearTimeout(timeoutHandler);

    // 重新设置 timeout，会在最后当前脚本执行完，调用一次
    timeoutHandler = setTimeout(function () {
      var hasReadyThisLoop = true;

      // 遍历检查当前文件内定义的模块是否就绪。由于前面定义的模块可能依赖后面的模块，
      // 所以一轮遍历后并不能确保模块就绪检查完成。
      // 需要循环检查，只有当每一轮没有模块就绪后，才停止遍历。
      while (hasReadyThisLoop) {
        hasReadyThisLoop = false;

        for (var name in loadedModules) {
          if (checkModuleReady(name)) {
            setModuleReady(name);
            hasReadyThisLoop = true;
          }
        }
      }

      // 待解析完模块状态，知道有哪些依赖的模块没有被加载后，依次去加载依赖的模块
      for (var name in loadedModules) {
        loadModuleDeps(name);
      }

      loadedModules = {};
    });
  }

  /**
   * 设置模块状态为已就绪
   * 
   * @param {string} name 模块名
   */
  function setModuleReady(name) {
    var mod = modules[name];

    // 如果模块已经就绪了，则不能再重复执行就绪操作
    if (mod.status === 'ready') {
      return;
    }

    var deps = mod.deps;
    var depValues = [];
    for (var i = 0, len = deps.length; i < len; i++) {
      depValues.push(modules[deps[i]].value);
    }

    // 依赖的模块都已就绪，则当前模块可以就绪了（执行当前模块的定义函数，得到当前模块的返回值。
    // 执行模块函数时，需要将依赖的模块作为实参传入）
    updateModule(name, {
      status: 'ready',
      value: mod.factory.apply(null, depValues)
    });

    delete loadedModules[name];

    // 当前模块就绪后，需要依次检查当前模块的父模块（即依赖当前模块的模块）是否就绪
    // 可以将模块依赖看成是一个树形结构，只有当处于叶子节点的模块就绪后，其父节点才能就绪，所以是一个自下而上的过程
    var parents = mod.parents;
    if (parents) {
      for (var i = 0, len = parents.length; i < len; i++) {
        if (checkModuleReady(parents[i])) {
          setModuleReady(parents[i]);
        }
      }
    }
  }

  /**
   * 加载模块对应的脚本
   *
   * @param {string} name 模块名
   * @param {Function} 加载成功后的回调函数
   */
  function createScript(name, onload) {
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.setAttribute('data-module', name);
    script.async = true;

    function innerOnLoad() {
      if (!script.readyState || /^complete$|^loaded$/.test(script.readyState)) {
        script.onreadystatechange = script.onload = null;
      }

      onload && onload();
    }

    if (script.readyState) {
      script.onreadystatechange = innerOnLoad;
    } else {
      script.onload = innerOnLoad;
    }

    script.src = /.+\.js$/i.test(name) ? name : name + '.js';
    document.getElementsByTagName('head')[0].appendChild(script);
  }

  /**
   * 获取当前正在执行的脚本
   */
  function getCurrentScript() {
    // 最新浏览器支持通过此属性获取当前正在执行的脚本
    if (document.currentScript) {
      return document.currentScript;
    }

    // 不支持 document.currentScript 的浏览器可以通过遍历 script 元素，找到其中状态为 interactive 的元素，
    // 即为当前正在执行的脚本（如果是同步脚本，可以直接通过 scripts[len - 1] 来获取当前正在执行的脚本，
    // 但此处脚本都是通过异步加载，无法这样简单判断）
    var scripts = document.getElementsByTagName('script');
    var len = scripts.length;
    while (len--) {
      var script = scripts[len];

      // 状态为'interactive'的即为当前正在执行的脚本
      if (script.readyState === 'interactive') {
        return script;
      }
    }
  }

  /**
   * 扩展对象
   *
   * @param {Object} source 源对象
   * @param {Object} dest 目标对象
   */
  function extend(source, dest) {
    for (var key in dest) {
      if (dest.hasOwnProperty(key)) {
        source[key] = dest[key];
      }
    }

    return source;
  }

  root.define = define;
  root.require = require;
})(this);
　　上篇文章介绍了如何实现一个最基本功能的加载器，但仅仅做到了能够加载依赖模块，还有许多的功能需要完善。本文将介绍如何实现单文件内定义多个模块的功能。

　　虽然 AMD 规范推荐开发时一个文件内只定义一个模块，但有个很常见的场景下需要单文件内定义多个模块的：开发完成上线时，为提高加载速度，需要把代码打包到一个或少数几个文件内，这就会出现单个文件内会定义多个模块的情况。这种情况在现有的实现中会导致模块的重复加载。如假设如下的文件中依次定义了 B 和 A 两个模块，其中 B 依赖 A。

``` javascript
define('B', ['A'], function (A) {
  xxx
});

define('A', function () {
  xxx
});
```

　　当解析 B 时，发现依赖 A，于是去加载 A，等待 A 就绪后再去使 B 就绪。同时在异步加载 A 的过程中，接着解析文件内定义的 A。由于 A 无依赖，直接就绪，并且触发 A 的父模块即 B 去检查自己是否就绪。由于依赖的 A 已就绪，所以 B 也可以就绪了。但此时由 B 触发的 A 的加载还在进行着。可能由于 A 已被打包进单文件中，源文件 A 已不包含在发布代码中而加载失败；或者就算 A 存在能加载成功，但重复的加载一次已存在的模块毫无意义。
  
　　当然，这个例子中，可以将 A 和 B 的定义调换一下位置就可以解决上面的问题了。但这就要求打包工具能够识别模块间的依赖关系，打包时要按照一定的顺序给模块排序，使加载器强依赖于打包工具。且复杂场景下模块间相互依赖，通过排序也无法解决。所以还是需要加载器自行解决。
  
　　这种单文件内定义多个模块的场景，还有几点需要说明：
  
+ 这种场景只应该出现在上线前打包时，开发时请避免。
+ 定义模块时，需要传递模块名参数。单模块定义时，可以将模块路径作为模块名，但多模块定义时就行不通了。当前，此场景的模块名是通过打包工具添加，开发时不应添加。
+ 此场景下，文件通常是通过手动添加 script 标签引入，而不是通过加载器作为依赖模块引入。模块通常需要一个返回值，供父模块调用，而此文件内容无法作为一个单独模块提供一个特定的返回值。


　　在上一个版本中，define 函数中会检查当前模块的所有依赖模块，如有依赖模块未被加载过，则创建 script 元素去加载。现在看来不能这么做了。只有等到文件内所有模块定义都执行完，才能知道当前文件内定义了哪些模块，哪些模块已经就绪，哪些依赖模块还未被加载。一个直接想到的方案是在 script 文件的 onload 事件中做这些检查，onload 事件会保证在脚本代码都执行完后再触发。但这个方案是行不通的，因为如上面第三点所述，此文件应该通过手动添加 script 标签引入，onload 事件不受加载器控制。

　　既然 onload 事件由于不受 loader 控制而无法使用，那可以通过 setTimeout 模拟一个类似 onload 的事件。
  
　　现在的问题可以抽象成如下都问题：一个文件内调用一次或多次同一个函数，需要在所有函数都调用完成后，再执行一个操作。此问题，可以通过借助 setTimeout 来解决。先定义一个全局变量 timeoutHandler，用于保存 setTimeout 的返回值。在 define 函数（也包括 require 函数，通常 require 调用也会打包在一起，所以实现时是在一个内部统一函数内）内首先调用 clearTimeout(timeoutHandler，用于保存) 清除上一个 define 内设置的异步回调，然后在执行完当前的 define 后，调用 timeoutHandler = setTimeout()，来设置异步回调。这样就可以保证后一个 define 定义会清掉前一个 define 内的异步回调，最后只会保留一个异步回调在所有 define 都执行后才被调用。代码如下：

``` javascript
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
```

　　具体实现代码可参见：https://github.com/bruce-xu/loader/blob/master/versions/0.2.0.js。

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { transformFromAstSync } = require('@babel/core');

let ID = 0

// 分析文件依赖
function createAsset(fileName) {

  const content = fs.readFileSync(fileName, { encoding: 'utf-8' })

  const ast = parser.parse(content, {
    sourceType: 'module'
  });

  const dependencies = [];

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    },
  })

  const id = ID++;

  // 转化代码
  const { code } = transformFromAstSync(ast, null, {
    presets: ['@babel/preset-env'],
  });

  return {
    id,
    fileName,
    dependencies,
    code,
  };
}

// 创建依赖图
function createGraph(entry) {
  const mainAsset = createAsset(entry);

  // 创建模块队列
  const queue = [mainAsset];

  // 循环队列
  for (const asset of queue) {

    // 添加模块的路径列表
    asset.mapping = {};

    const dirname = path.dirname(asset.fileName);

    // 循环文件里面的依赖然后再分析依赖
    asset.dependencies.forEach(relativePath => {
      const absolutePath = path.join(dirname, relativePath);
      const child = createAsset(absolutePath);
      // 依赖的相对路径作为key 分析模块id作为值
      asset.mapping[relativePath] = child.id;
      // 把依赖的分析模块推进队列继续循环
      queue.push(child);
    });
  }

  return queue
}

function bundle(graph) {
  let modules = '';
  // 把graph转换成可以执行的代码
  graph.forEach(mod => {
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`;
  });

  // 实现commonjs
  const result = `
  (function(modules) {
    function require(id) {
      const [fn, mapping] = modules[id];
      function localRequire(name) {
        return require(mapping[name]);
      }
      const module = { exports : {} };
      fn(localRequire, module, module.exports);
      return module.exports;
    }
    require(0);
  })({${modules}})
`;

  return result;
}

const graph = createGraph('./example/entry.js');
const result = bundle(graph);

console.log(result);
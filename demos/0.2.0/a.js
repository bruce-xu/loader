define('a', [], function (a) {
  return {
    a: 'aa'
  };
});

define('b', ['a'], function (a) {
  return {
    a: a.a,
    b: 'bb'
  };
});

define('c', ['a', 'b'], function (a, b) {
  return {
    a: a.a,
    b: b.b,
    c: 'cc'
  };
});

define('d', ['a', 'b', 'c'], function (a, b, c) {
  return {
    a: a.a,
    b: b.b,
    c: c.c,
    d: 'dd'
  };
});

define('e', ['a', 'b', 'c', 'd'], function (a, b, c, d) {
  return {
    a: a.a,
    b: b.b,
    c: c.c,
    d: d.d,
    e: 'ee'
  };
});
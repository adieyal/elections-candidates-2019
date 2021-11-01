(function () {
  'use strict';

  var xhtml = "http://www.w3.org/1999/xhtml";

  var namespaces = {
    svg: "http://www.w3.org/2000/svg",
    xhtml: xhtml,
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/"
  };

  function namespace(name) {
    var prefix = name += "", i = prefix.indexOf(":");
    if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns") name = name.slice(i + 1);
    return namespaces.hasOwnProperty(prefix) ? {space: namespaces[prefix], local: name} : name;
  }

  function creatorInherit(name) {
    return function() {
      var document = this.ownerDocument,
          uri = this.namespaceURI;
      return uri === xhtml && document.documentElement.namespaceURI === xhtml
          ? document.createElement(name)
          : document.createElementNS(uri, name);
    };
  }

  function creatorFixed(fullname) {
    return function() {
      return this.ownerDocument.createElementNS(fullname.space, fullname.local);
    };
  }

  function creator(name) {
    var fullname = namespace(name);
    return (fullname.local
        ? creatorFixed
        : creatorInherit)(fullname);
  }

  function none() {}

  function selector(selector) {
    return selector == null ? none : function() {
      return this.querySelector(selector);
    };
  }

  function selection_select(select) {
    if (typeof select !== "function") select = selector(select);

    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
        if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
          if ("__data__" in node) subnode.__data__ = node.__data__;
          subgroup[i] = subnode;
        }
      }
    }

    return new Selection(subgroups, this._parents);
  }

  function empty() {
    return [];
  }

  function selectorAll(selector) {
    return selector == null ? empty : function() {
      return this.querySelectorAll(selector);
    };
  }

  function selection_selectAll(select) {
    if (typeof select !== "function") select = selectorAll(select);

    for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          subgroups.push(select.call(node, node.__data__, i, group));
          parents.push(node);
        }
      }
    }

    return new Selection(subgroups, parents);
  }

  function matcher(selector) {
    return function() {
      return this.matches(selector);
    };
  }

  function selection_filter(match) {
    if (typeof match !== "function") match = matcher(match);

    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
        if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
          subgroup.push(node);
        }
      }
    }

    return new Selection(subgroups, this._parents);
  }

  function sparse(update) {
    return new Array(update.length);
  }

  function selection_enter() {
    return new Selection(this._enter || this._groups.map(sparse), this._parents);
  }

  function EnterNode(parent, datum) {
    this.ownerDocument = parent.ownerDocument;
    this.namespaceURI = parent.namespaceURI;
    this._next = null;
    this._parent = parent;
    this.__data__ = datum;
  }

  EnterNode.prototype = {
    constructor: EnterNode,
    appendChild: function(child) { return this._parent.insertBefore(child, this._next); },
    insertBefore: function(child, next) { return this._parent.insertBefore(child, next); },
    querySelector: function(selector) { return this._parent.querySelector(selector); },
    querySelectorAll: function(selector) { return this._parent.querySelectorAll(selector); }
  };

  function constant(x) {
    return function() {
      return x;
    };
  }

  var keyPrefix = "$"; // Protect against keys like “__proto__”.

  function bindIndex(parent, group, enter, update, exit, data) {
    var i = 0,
        node,
        groupLength = group.length,
        dataLength = data.length;

    // Put any non-null nodes that fit into update.
    // Put any null nodes into enter.
    // Put any remaining data into enter.
    for (; i < dataLength; ++i) {
      if (node = group[i]) {
        node.__data__ = data[i];
        update[i] = node;
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }

    // Put any non-null nodes that don’t fit into exit.
    for (; i < groupLength; ++i) {
      if (node = group[i]) {
        exit[i] = node;
      }
    }
  }

  function bindKey(parent, group, enter, update, exit, data, key) {
    var i,
        node,
        nodeByKeyValue = {},
        groupLength = group.length,
        dataLength = data.length,
        keyValues = new Array(groupLength),
        keyValue;

    // Compute the key for each node.
    // If multiple nodes have the same key, the duplicates are added to exit.
    for (i = 0; i < groupLength; ++i) {
      if (node = group[i]) {
        keyValues[i] = keyValue = keyPrefix + key.call(node, node.__data__, i, group);
        if (keyValue in nodeByKeyValue) {
          exit[i] = node;
        } else {
          nodeByKeyValue[keyValue] = node;
        }
      }
    }

    // Compute the key for each datum.
    // If there a node associated with this key, join and add it to update.
    // If there is not (or the key is a duplicate), add it to enter.
    for (i = 0; i < dataLength; ++i) {
      keyValue = keyPrefix + key.call(parent, data[i], i, data);
      if (node = nodeByKeyValue[keyValue]) {
        update[i] = node;
        node.__data__ = data[i];
        nodeByKeyValue[keyValue] = null;
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }

    // Add any remaining nodes that were not bound to data to exit.
    for (i = 0; i < groupLength; ++i) {
      if ((node = group[i]) && (nodeByKeyValue[keyValues[i]] === node)) {
        exit[i] = node;
      }
    }
  }

  function selection_data(value, key) {
    if (!value) {
      data = new Array(this.size()), j = -1;
      this.each(function(d) { data[++j] = d; });
      return data;
    }

    var bind = key ? bindKey : bindIndex,
        parents = this._parents,
        groups = this._groups;

    if (typeof value !== "function") value = constant(value);

    for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
      var parent = parents[j],
          group = groups[j],
          groupLength = group.length,
          data = value.call(parent, parent && parent.__data__, j, parents),
          dataLength = data.length,
          enterGroup = enter[j] = new Array(dataLength),
          updateGroup = update[j] = new Array(dataLength),
          exitGroup = exit[j] = new Array(groupLength);

      bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);

      // Now connect the enter nodes to their following update node, such that
      // appendChild can insert the materialized enter node before this node,
      // rather than at the end of the parent node.
      for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
        if (previous = enterGroup[i0]) {
          if (i0 >= i1) i1 = i0 + 1;
          while (!(next = updateGroup[i1]) && ++i1 < dataLength);
          previous._next = next || null;
        }
      }
    }

    update = new Selection(update, parents);
    update._enter = enter;
    update._exit = exit;
    return update;
  }

  function selection_exit() {
    return new Selection(this._exit || this._groups.map(sparse), this._parents);
  }

  function selection_join(onenter, onupdate, onexit) {
    var enter = this.enter(), update = this, exit = this.exit();
    enter = typeof onenter === "function" ? onenter(enter) : enter.append(onenter + "");
    if (onupdate != null) update = onupdate(update);
    if (onexit == null) exit.remove(); else onexit(exit);
    return enter && update ? enter.merge(update).order() : update;
  }

  function selection_merge(selection) {

    for (var groups0 = this._groups, groups1 = selection._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
      for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group0[i] || group1[i]) {
          merge[i] = node;
        }
      }
    }

    for (; j < m0; ++j) {
      merges[j] = groups0[j];
    }

    return new Selection(merges, this._parents);
  }

  function selection_order() {

    for (var groups = this._groups, j = -1, m = groups.length; ++j < m;) {
      for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0;) {
        if (node = group[i]) {
          if (next && node.compareDocumentPosition(next) ^ 4) next.parentNode.insertBefore(node, next);
          next = node;
        }
      }
    }

    return this;
  }

  function selection_sort(compare) {
    if (!compare) compare = ascending;

    function compareNode(a, b) {
      return a && b ? compare(a.__data__, b.__data__) : !a - !b;
    }

    for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          sortgroup[i] = node;
        }
      }
      sortgroup.sort(compareNode);
    }

    return new Selection(sortgroups, this._parents).order();
  }

  function ascending(a, b) {
    return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  }

  function selection_call() {
    var callback = arguments[0];
    arguments[0] = this;
    callback.apply(null, arguments);
    return this;
  }

  function selection_nodes() {
    var nodes = new Array(this.size()), i = -1;
    this.each(function() { nodes[++i] = this; });
    return nodes;
  }

  function selection_node() {

    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
        var node = group[i];
        if (node) return node;
      }
    }

    return null;
  }

  function selection_size() {
    var size = 0;
    this.each(function() { ++size; });
    return size;
  }

  function selection_empty() {
    return !this.node();
  }

  function selection_each(callback) {

    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
        if (node = group[i]) callback.call(node, node.__data__, i, group);
      }
    }

    return this;
  }

  function attrRemove(name) {
    return function() {
      this.removeAttribute(name);
    };
  }

  function attrRemoveNS(fullname) {
    return function() {
      this.removeAttributeNS(fullname.space, fullname.local);
    };
  }

  function attrConstant(name, value) {
    return function() {
      this.setAttribute(name, value);
    };
  }

  function attrConstantNS(fullname, value) {
    return function() {
      this.setAttributeNS(fullname.space, fullname.local, value);
    };
  }

  function attrFunction(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) this.removeAttribute(name);
      else this.setAttribute(name, v);
    };
  }

  function attrFunctionNS(fullname, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) this.removeAttributeNS(fullname.space, fullname.local);
      else this.setAttributeNS(fullname.space, fullname.local, v);
    };
  }

  function selection_attr(name, value) {
    var fullname = namespace(name);

    if (arguments.length < 2) {
      var node = this.node();
      return fullname.local
          ? node.getAttributeNS(fullname.space, fullname.local)
          : node.getAttribute(fullname);
    }

    return this.each((value == null
        ? (fullname.local ? attrRemoveNS : attrRemove) : (typeof value === "function"
        ? (fullname.local ? attrFunctionNS : attrFunction)
        : (fullname.local ? attrConstantNS : attrConstant)))(fullname, value));
  }

  function defaultView(node) {
    return (node.ownerDocument && node.ownerDocument.defaultView) // node is a Node
        || (node.document && node) // node is a Window
        || node.defaultView; // node is a Document
  }

  function styleRemove(name) {
    return function() {
      this.style.removeProperty(name);
    };
  }

  function styleConstant(name, value, priority) {
    return function() {
      this.style.setProperty(name, value, priority);
    };
  }

  function styleFunction(name, value, priority) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) this.style.removeProperty(name);
      else this.style.setProperty(name, v, priority);
    };
  }

  function selection_style(name, value, priority) {
    return arguments.length > 1
        ? this.each((value == null
              ? styleRemove : typeof value === "function"
              ? styleFunction
              : styleConstant)(name, value, priority == null ? "" : priority))
        : styleValue(this.node(), name);
  }

  function styleValue(node, name) {
    return node.style.getPropertyValue(name)
        || defaultView(node).getComputedStyle(node, null).getPropertyValue(name);
  }

  function propertyRemove(name) {
    return function() {
      delete this[name];
    };
  }

  function propertyConstant(name, value) {
    return function() {
      this[name] = value;
    };
  }

  function propertyFunction(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) delete this[name];
      else this[name] = v;
    };
  }

  function selection_property(name, value) {
    return arguments.length > 1
        ? this.each((value == null
            ? propertyRemove : typeof value === "function"
            ? propertyFunction
            : propertyConstant)(name, value))
        : this.node()[name];
  }

  function classArray(string) {
    return string.trim().split(/^|\s+/);
  }

  function classList(node) {
    return node.classList || new ClassList(node);
  }

  function ClassList(node) {
    this._node = node;
    this._names = classArray(node.getAttribute("class") || "");
  }

  ClassList.prototype = {
    add: function(name) {
      var i = this._names.indexOf(name);
      if (i < 0) {
        this._names.push(name);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    remove: function(name) {
      var i = this._names.indexOf(name);
      if (i >= 0) {
        this._names.splice(i, 1);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    contains: function(name) {
      return this._names.indexOf(name) >= 0;
    }
  };

  function classedAdd(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n) list.add(names[i]);
  }

  function classedRemove(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n) list.remove(names[i]);
  }

  function classedTrue(names) {
    return function() {
      classedAdd(this, names);
    };
  }

  function classedFalse(names) {
    return function() {
      classedRemove(this, names);
    };
  }

  function classedFunction(names, value) {
    return function() {
      (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
    };
  }

  function selection_classed(name, value) {
    var names = classArray(name + "");

    if (arguments.length < 2) {
      var list = classList(this.node()), i = -1, n = names.length;
      while (++i < n) if (!list.contains(names[i])) return false;
      return true;
    }

    return this.each((typeof value === "function"
        ? classedFunction : value
        ? classedTrue
        : classedFalse)(names, value));
  }

  function textRemove() {
    this.textContent = "";
  }

  function textConstant(value) {
    return function() {
      this.textContent = value;
    };
  }

  function textFunction(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.textContent = v == null ? "" : v;
    };
  }

  function selection_text(value) {
    return arguments.length
        ? this.each(value == null
            ? textRemove : (typeof value === "function"
            ? textFunction
            : textConstant)(value))
        : this.node().textContent;
  }

  function htmlRemove() {
    this.innerHTML = "";
  }

  function htmlConstant(value) {
    return function() {
      this.innerHTML = value;
    };
  }

  function htmlFunction(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.innerHTML = v == null ? "" : v;
    };
  }

  function selection_html(value) {
    return arguments.length
        ? this.each(value == null
            ? htmlRemove : (typeof value === "function"
            ? htmlFunction
            : htmlConstant)(value))
        : this.node().innerHTML;
  }

  function raise() {
    if (this.nextSibling) this.parentNode.appendChild(this);
  }

  function selection_raise() {
    return this.each(raise);
  }

  function lower() {
    if (this.previousSibling) this.parentNode.insertBefore(this, this.parentNode.firstChild);
  }

  function selection_lower() {
    return this.each(lower);
  }

  function selection_append(name) {
    var create = typeof name === "function" ? name : creator(name);
    return this.select(function() {
      return this.appendChild(create.apply(this, arguments));
    });
  }

  function constantNull() {
    return null;
  }

  function selection_insert(name, before) {
    var create = typeof name === "function" ? name : creator(name),
        select = before == null ? constantNull : typeof before === "function" ? before : selector(before);
    return this.select(function() {
      return this.insertBefore(create.apply(this, arguments), select.apply(this, arguments) || null);
    });
  }

  function remove() {
    var parent = this.parentNode;
    if (parent) parent.removeChild(this);
  }

  function selection_remove() {
    return this.each(remove);
  }

  function selection_cloneShallow() {
    var clone = this.cloneNode(false), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }

  function selection_cloneDeep() {
    var clone = this.cloneNode(true), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }

  function selection_clone(deep) {
    return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
  }

  function selection_datum(value) {
    return arguments.length
        ? this.property("__data__", value)
        : this.node().__data__;
  }

  var filterEvents = {};

  var event = null;

  if (typeof document !== "undefined") {
    var element = document.documentElement;
    if (!("onmouseenter" in element)) {
      filterEvents = {mouseenter: "mouseover", mouseleave: "mouseout"};
    }
  }

  function filterContextListener(listener, index, group) {
    listener = contextListener(listener, index, group);
    return function(event) {
      var related = event.relatedTarget;
      if (!related || (related !== this && !(related.compareDocumentPosition(this) & 8))) {
        listener.call(this, event);
      }
    };
  }

  function contextListener(listener, index, group) {
    return function(event1) {
      var event0 = event; // Events can be reentrant (e.g., focus).
      event = event1;
      try {
        listener.call(this, this.__data__, index, group);
      } finally {
        event = event0;
      }
    };
  }

  function parseTypenames(typenames) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
      return {type: t, name: name};
    });
  }

  function onRemove(typename) {
    return function() {
      var on = this.__on;
      if (!on) return;
      for (var j = 0, i = -1, m = on.length, o; j < m; ++j) {
        if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.capture);
        } else {
          on[++i] = o;
        }
      }
      if (++i) on.length = i;
      else delete this.__on;
    };
  }

  function onAdd(typename, value, capture) {
    var wrap = filterEvents.hasOwnProperty(typename.type) ? filterContextListener : contextListener;
    return function(d, i, group) {
      var on = this.__on, o, listener = wrap(value, i, group);
      if (on) for (var j = 0, m = on.length; j < m; ++j) {
        if ((o = on[j]).type === typename.type && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.capture);
          this.addEventListener(o.type, o.listener = listener, o.capture = capture);
          o.value = value;
          return;
        }
      }
      this.addEventListener(typename.type, listener, capture);
      o = {type: typename.type, name: typename.name, value: value, listener: listener, capture: capture};
      if (!on) this.__on = [o];
      else on.push(o);
    };
  }

  function selection_on(typename, value, capture) {
    var typenames = parseTypenames(typename + ""), i, n = typenames.length, t;

    if (arguments.length < 2) {
      var on = this.node().__on;
      if (on) for (var j = 0, m = on.length, o; j < m; ++j) {
        for (i = 0, o = on[j]; i < n; ++i) {
          if ((t = typenames[i]).type === o.type && t.name === o.name) {
            return o.value;
          }
        }
      }
      return;
    }

    on = value ? onAdd : onRemove;
    if (capture == null) capture = false;
    for (i = 0; i < n; ++i) this.each(on(typenames[i], value, capture));
    return this;
  }

  function dispatchEvent(node, type, params) {
    var window = defaultView(node),
        event = window.CustomEvent;

    if (typeof event === "function") {
      event = new event(type, params);
    } else {
      event = window.document.createEvent("Event");
      if (params) event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail;
      else event.initEvent(type, false, false);
    }

    node.dispatchEvent(event);
  }

  function dispatchConstant(type, params) {
    return function() {
      return dispatchEvent(this, type, params);
    };
  }

  function dispatchFunction(type, params) {
    return function() {
      return dispatchEvent(this, type, params.apply(this, arguments));
    };
  }

  function selection_dispatch(type, params) {
    return this.each((typeof params === "function"
        ? dispatchFunction
        : dispatchConstant)(type, params));
  }

  var root = [null];

  function Selection(groups, parents) {
    this._groups = groups;
    this._parents = parents;
  }

  function selection() {
    return new Selection([[document.documentElement]], root);
  }

  Selection.prototype = selection.prototype = {
    constructor: Selection,
    select: selection_select,
    selectAll: selection_selectAll,
    filter: selection_filter,
    data: selection_data,
    enter: selection_enter,
    exit: selection_exit,
    join: selection_join,
    merge: selection_merge,
    order: selection_order,
    sort: selection_sort,
    call: selection_call,
    nodes: selection_nodes,
    node: selection_node,
    size: selection_size,
    empty: selection_empty,
    each: selection_each,
    attr: selection_attr,
    style: selection_style,
    property: selection_property,
    classed: selection_classed,
    text: selection_text,
    html: selection_html,
    raise: selection_raise,
    lower: selection_lower,
    append: selection_append,
    insert: selection_insert,
    remove: selection_remove,
    clone: selection_clone,
    datum: selection_datum,
    on: selection_on,
    dispatch: selection_dispatch
  };

  function select(selector) {
    return typeof selector === "string"
        ? new Selection([[document.querySelector(selector)]], [document.documentElement])
        : new Selection([[selector]], root);
  }

  function selectAll(selector) {
    return typeof selector === "string"
        ? new Selection([document.querySelectorAll(selector)], [document.documentElement])
        : new Selection([selector == null ? [] : selector], root);
  }

  function ascending$1(a, b) {
    return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  }

  function bisector(compare) {
    if (compare.length === 1) compare = ascendingComparator(compare);
    return {
      left: function(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        while (lo < hi) {
          var mid = lo + hi >>> 1;
          if (compare(a[mid], x) < 0) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      },
      right: function(a, x, lo, hi) {
        if (lo == null) lo = 0;
        if (hi == null) hi = a.length;
        while (lo < hi) {
          var mid = lo + hi >>> 1;
          if (compare(a[mid], x) > 0) hi = mid;
          else lo = mid + 1;
        }
        return lo;
      }
    };
  }

  function ascendingComparator(f) {
    return function(d, x) {
      return ascending$1(f(d), x);
    };
  }

  var ascendingBisect = bisector(ascending$1);
  var bisectRight = ascendingBisect.right;

  var e10 = Math.sqrt(50),
      e5 = Math.sqrt(10),
      e2 = Math.sqrt(2);

  function ticks(start, stop, count) {
    var reverse,
        i = -1,
        n,
        ticks,
        step;

    stop = +stop, start = +start, count = +count;
    if (start === stop && count > 0) return [start];
    if (reverse = stop < start) n = start, start = stop, stop = n;
    if ((step = tickIncrement(start, stop, count)) === 0 || !isFinite(step)) return [];

    if (step > 0) {
      start = Math.ceil(start / step);
      stop = Math.floor(stop / step);
      ticks = new Array(n = Math.ceil(stop - start + 1));
      while (++i < n) ticks[i] = (start + i) * step;
    } else {
      start = Math.floor(start * step);
      stop = Math.ceil(stop * step);
      ticks = new Array(n = Math.ceil(start - stop + 1));
      while (++i < n) ticks[i] = (start - i) / step;
    }

    if (reverse) ticks.reverse();

    return ticks;
  }

  function tickIncrement(start, stop, count) {
    var step = (stop - start) / Math.max(0, count),
        power = Math.floor(Math.log(step) / Math.LN10),
        error = step / Math.pow(10, power);
    return power >= 0
        ? (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1) * Math.pow(10, power)
        : -Math.pow(10, -power) / (error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1);
  }

  function tickStep(start, stop, count) {
    var step0 = Math.abs(stop - start) / Math.max(0, count),
        step1 = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)),
        error = step0 / step1;
    if (error >= e10) step1 *= 10;
    else if (error >= e5) step1 *= 5;
    else if (error >= e2) step1 *= 2;
    return stop < start ? -step1 : step1;
  }

  var prefix = "$";

  function Map() {}

  Map.prototype = map.prototype = {
    constructor: Map,
    has: function(key) {
      return (prefix + key) in this;
    },
    get: function(key) {
      return this[prefix + key];
    },
    set: function(key, value) {
      this[prefix + key] = value;
      return this;
    },
    remove: function(key) {
      var property = prefix + key;
      return property in this && delete this[property];
    },
    clear: function() {
      for (var property in this) if (property[0] === prefix) delete this[property];
    },
    keys: function() {
      var keys = [];
      for (var property in this) if (property[0] === prefix) keys.push(property.slice(1));
      return keys;
    },
    values: function() {
      var values = [];
      for (var property in this) if (property[0] === prefix) values.push(this[property]);
      return values;
    },
    entries: function() {
      var entries = [];
      for (var property in this) if (property[0] === prefix) entries.push({key: property.slice(1), value: this[property]});
      return entries;
    },
    size: function() {
      var size = 0;
      for (var property in this) if (property[0] === prefix) ++size;
      return size;
    },
    empty: function() {
      for (var property in this) if (property[0] === prefix) return false;
      return true;
    },
    each: function(f) {
      for (var property in this) if (property[0] === prefix) f(this[property], property.slice(1), this);
    }
  };

  function map(object, f) {
    var map = new Map;

    // Copy constructor.
    if (object instanceof Map) object.each(function(value, key) { map.set(key, value); });

    // Index array by numeric index or specified key function.
    else if (Array.isArray(object)) {
      var i = -1,
          n = object.length,
          o;

      if (f == null) while (++i < n) map.set(i, object[i]);
      else while (++i < n) map.set(f(o = object[i], i, object), o);
    }

    // Convert object to map.
    else if (object) for (var key in object) map.set(key, object[key]);

    return map;
  }

  function Set() {}

  var proto = map.prototype;

  Set.prototype = set.prototype = {
    constructor: Set,
    has: proto.has,
    add: function(value) {
      value += "";
      this[prefix + value] = value;
      return this;
    },
    remove: proto.remove,
    clear: proto.clear,
    values: proto.keys,
    size: proto.size,
    empty: proto.empty,
    each: proto.each
  };

  function set(object, f) {
    var set = new Set;

    // Copy constructor.
    if (object instanceof Set) object.each(function(value) { set.add(value); });

    // Otherwise, assume it’s an array.
    else if (object) {
      var i = -1, n = object.length;
      if (f == null) while (++i < n) set.add(object[i]);
      else while (++i < n) set.add(f(object[i], i, object));
    }

    return set;
  }

  var array = Array.prototype;

  var map$1 = array.map;
  var slice = array.slice;

  function define(constructor, factory, prototype) {
    constructor.prototype = factory.prototype = prototype;
    prototype.constructor = constructor;
  }

  function extend(parent, definition) {
    var prototype = Object.create(parent.prototype);
    for (var key in definition) prototype[key] = definition[key];
    return prototype;
  }

  function Color() {}

  var darker = 0.7;
  var brighter = 1 / darker;

  var reI = "\\s*([+-]?\\d+)\\s*",
      reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*",
      reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
      reHex = /^#([0-9a-f]{3,8})$/,
      reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$"),
      reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$"),
      reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$"),
      reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$"),
      reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$"),
      reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");

  var named = {
    aliceblue: 0xf0f8ff,
    antiquewhite: 0xfaebd7,
    aqua: 0x00ffff,
    aquamarine: 0x7fffd4,
    azure: 0xf0ffff,
    beige: 0xf5f5dc,
    bisque: 0xffe4c4,
    black: 0x000000,
    blanchedalmond: 0xffebcd,
    blue: 0x0000ff,
    blueviolet: 0x8a2be2,
    brown: 0xa52a2a,
    burlywood: 0xdeb887,
    cadetblue: 0x5f9ea0,
    chartreuse: 0x7fff00,
    chocolate: 0xd2691e,
    coral: 0xff7f50,
    cornflowerblue: 0x6495ed,
    cornsilk: 0xfff8dc,
    crimson: 0xdc143c,
    cyan: 0x00ffff,
    darkblue: 0x00008b,
    darkcyan: 0x008b8b,
    darkgoldenrod: 0xb8860b,
    darkgray: 0xa9a9a9,
    darkgreen: 0x006400,
    darkgrey: 0xa9a9a9,
    darkkhaki: 0xbdb76b,
    darkmagenta: 0x8b008b,
    darkolivegreen: 0x556b2f,
    darkorange: 0xff8c00,
    darkorchid: 0x9932cc,
    darkred: 0x8b0000,
    darksalmon: 0xe9967a,
    darkseagreen: 0x8fbc8f,
    darkslateblue: 0x483d8b,
    darkslategray: 0x2f4f4f,
    darkslategrey: 0x2f4f4f,
    darkturquoise: 0x00ced1,
    darkviolet: 0x9400d3,
    deeppink: 0xff1493,
    deepskyblue: 0x00bfff,
    dimgray: 0x696969,
    dimgrey: 0x696969,
    dodgerblue: 0x1e90ff,
    firebrick: 0xb22222,
    floralwhite: 0xfffaf0,
    forestgreen: 0x228b22,
    fuchsia: 0xff00ff,
    gainsboro: 0xdcdcdc,
    ghostwhite: 0xf8f8ff,
    gold: 0xffd700,
    goldenrod: 0xdaa520,
    gray: 0x808080,
    green: 0x008000,
    greenyellow: 0xadff2f,
    grey: 0x808080,
    honeydew: 0xf0fff0,
    hotpink: 0xff69b4,
    indianred: 0xcd5c5c,
    indigo: 0x4b0082,
    ivory: 0xfffff0,
    khaki: 0xf0e68c,
    lavender: 0xe6e6fa,
    lavenderblush: 0xfff0f5,
    lawngreen: 0x7cfc00,
    lemonchiffon: 0xfffacd,
    lightblue: 0xadd8e6,
    lightcoral: 0xf08080,
    lightcyan: 0xe0ffff,
    lightgoldenrodyellow: 0xfafad2,
    lightgray: 0xd3d3d3,
    lightgreen: 0x90ee90,
    lightgrey: 0xd3d3d3,
    lightpink: 0xffb6c1,
    lightsalmon: 0xffa07a,
    lightseagreen: 0x20b2aa,
    lightskyblue: 0x87cefa,
    lightslategray: 0x778899,
    lightslategrey: 0x778899,
    lightsteelblue: 0xb0c4de,
    lightyellow: 0xffffe0,
    lime: 0x00ff00,
    limegreen: 0x32cd32,
    linen: 0xfaf0e6,
    magenta: 0xff00ff,
    maroon: 0x800000,
    mediumaquamarine: 0x66cdaa,
    mediumblue: 0x0000cd,
    mediumorchid: 0xba55d3,
    mediumpurple: 0x9370db,
    mediumseagreen: 0x3cb371,
    mediumslateblue: 0x7b68ee,
    mediumspringgreen: 0x00fa9a,
    mediumturquoise: 0x48d1cc,
    mediumvioletred: 0xc71585,
    midnightblue: 0x191970,
    mintcream: 0xf5fffa,
    mistyrose: 0xffe4e1,
    moccasin: 0xffe4b5,
    navajowhite: 0xffdead,
    navy: 0x000080,
    oldlace: 0xfdf5e6,
    olive: 0x808000,
    olivedrab: 0x6b8e23,
    orange: 0xffa500,
    orangered: 0xff4500,
    orchid: 0xda70d6,
    palegoldenrod: 0xeee8aa,
    palegreen: 0x98fb98,
    paleturquoise: 0xafeeee,
    palevioletred: 0xdb7093,
    papayawhip: 0xffefd5,
    peachpuff: 0xffdab9,
    peru: 0xcd853f,
    pink: 0xffc0cb,
    plum: 0xdda0dd,
    powderblue: 0xb0e0e6,
    purple: 0x800080,
    rebeccapurple: 0x663399,
    red: 0xff0000,
    rosybrown: 0xbc8f8f,
    royalblue: 0x4169e1,
    saddlebrown: 0x8b4513,
    salmon: 0xfa8072,
    sandybrown: 0xf4a460,
    seagreen: 0x2e8b57,
    seashell: 0xfff5ee,
    sienna: 0xa0522d,
    silver: 0xc0c0c0,
    skyblue: 0x87ceeb,
    slateblue: 0x6a5acd,
    slategray: 0x708090,
    slategrey: 0x708090,
    snow: 0xfffafa,
    springgreen: 0x00ff7f,
    steelblue: 0x4682b4,
    tan: 0xd2b48c,
    teal: 0x008080,
    thistle: 0xd8bfd8,
    tomato: 0xff6347,
    turquoise: 0x40e0d0,
    violet: 0xee82ee,
    wheat: 0xf5deb3,
    white: 0xffffff,
    whitesmoke: 0xf5f5f5,
    yellow: 0xffff00,
    yellowgreen: 0x9acd32
  };

  define(Color, color, {
    copy: function(channels) {
      return Object.assign(new this.constructor, this, channels);
    },
    displayable: function() {
      return this.rgb().displayable();
    },
    hex: color_formatHex, // Deprecated! Use color.formatHex.
    formatHex: color_formatHex,
    formatHsl: color_formatHsl,
    formatRgb: color_formatRgb,
    toString: color_formatRgb
  });

  function color_formatHex() {
    return this.rgb().formatHex();
  }

  function color_formatHsl() {
    return hslConvert(this).formatHsl();
  }

  function color_formatRgb() {
    return this.rgb().formatRgb();
  }

  function color(format) {
    var m, l;
    format = (format + "").trim().toLowerCase();
    return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) // #ff0000
        : l === 3 ? new Rgb((m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), ((m & 0xf) << 4) | (m & 0xf), 1) // #f00
        : l === 8 ? rgba(m >> 24 & 0xff, m >> 16 & 0xff, m >> 8 & 0xff, (m & 0xff) / 0xff) // #ff000000
        : l === 4 ? rgba((m >> 12 & 0xf) | (m >> 8 & 0xf0), (m >> 8 & 0xf) | (m >> 4 & 0xf0), (m >> 4 & 0xf) | (m & 0xf0), (((m & 0xf) << 4) | (m & 0xf)) / 0xff) // #f000
        : null) // invalid hex
        : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) // rgb(255, 0, 0)
        : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) // rgb(100%, 0%, 0%)
        : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) // rgba(255, 0, 0, 1)
        : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) // rgb(100%, 0%, 0%, 1)
        : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) // hsl(120, 50%, 50%)
        : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) // hsla(120, 50%, 50%, 1)
        : named.hasOwnProperty(format) ? rgbn(named[format]) // eslint-disable-line no-prototype-builtins
        : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0)
        : null;
  }

  function rgbn(n) {
    return new Rgb(n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff, 1);
  }

  function rgba(r, g, b, a) {
    if (a <= 0) r = g = b = NaN;
    return new Rgb(r, g, b, a);
  }

  function rgbConvert(o) {
    if (!(o instanceof Color)) o = color(o);
    if (!o) return new Rgb;
    o = o.rgb();
    return new Rgb(o.r, o.g, o.b, o.opacity);
  }

  function rgb(r, g, b, opacity) {
    return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
  }

  function Rgb(r, g, b, opacity) {
    this.r = +r;
    this.g = +g;
    this.b = +b;
    this.opacity = +opacity;
  }

  define(Rgb, rgb, extend(Color, {
    brighter: function(k) {
      k = k == null ? brighter : Math.pow(brighter, k);
      return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
    },
    darker: function(k) {
      k = k == null ? darker : Math.pow(darker, k);
      return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
    },
    rgb: function() {
      return this;
    },
    displayable: function() {
      return (-0.5 <= this.r && this.r < 255.5)
          && (-0.5 <= this.g && this.g < 255.5)
          && (-0.5 <= this.b && this.b < 255.5)
          && (0 <= this.opacity && this.opacity <= 1);
    },
    hex: rgb_formatHex, // Deprecated! Use color.formatHex.
    formatHex: rgb_formatHex,
    formatRgb: rgb_formatRgb,
    toString: rgb_formatRgb
  }));

  function rgb_formatHex() {
    return "#" + hex(this.r) + hex(this.g) + hex(this.b);
  }

  function rgb_formatRgb() {
    var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
    return (a === 1 ? "rgb(" : "rgba(")
        + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", "
        + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", "
        + Math.max(0, Math.min(255, Math.round(this.b) || 0))
        + (a === 1 ? ")" : ", " + a + ")");
  }

  function hex(value) {
    value = Math.max(0, Math.min(255, Math.round(value) || 0));
    return (value < 16 ? "0" : "") + value.toString(16);
  }

  function hsla(h, s, l, a) {
    if (a <= 0) h = s = l = NaN;
    else if (l <= 0 || l >= 1) h = s = NaN;
    else if (s <= 0) h = NaN;
    return new Hsl(h, s, l, a);
  }

  function hslConvert(o) {
    if (o instanceof Hsl) return new Hsl(o.h, o.s, o.l, o.opacity);
    if (!(o instanceof Color)) o = color(o);
    if (!o) return new Hsl;
    if (o instanceof Hsl) return o;
    o = o.rgb();
    var r = o.r / 255,
        g = o.g / 255,
        b = o.b / 255,
        min = Math.min(r, g, b),
        max = Math.max(r, g, b),
        h = NaN,
        s = max - min,
        l = (max + min) / 2;
    if (s) {
      if (r === max) h = (g - b) / s + (g < b) * 6;
      else if (g === max) h = (b - r) / s + 2;
      else h = (r - g) / s + 4;
      s /= l < 0.5 ? max + min : 2 - max - min;
      h *= 60;
    } else {
      s = l > 0 && l < 1 ? 0 : h;
    }
    return new Hsl(h, s, l, o.opacity);
  }

  function hsl(h, s, l, opacity) {
    return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
  }

  function Hsl(h, s, l, opacity) {
    this.h = +h;
    this.s = +s;
    this.l = +l;
    this.opacity = +opacity;
  }

  define(Hsl, hsl, extend(Color, {
    brighter: function(k) {
      k = k == null ? brighter : Math.pow(brighter, k);
      return new Hsl(this.h, this.s, this.l * k, this.opacity);
    },
    darker: function(k) {
      k = k == null ? darker : Math.pow(darker, k);
      return new Hsl(this.h, this.s, this.l * k, this.opacity);
    },
    rgb: function() {
      var h = this.h % 360 + (this.h < 0) * 360,
          s = isNaN(h) || isNaN(this.s) ? 0 : this.s,
          l = this.l,
          m2 = l + (l < 0.5 ? l : 1 - l) * s,
          m1 = 2 * l - m2;
      return new Rgb(
        hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
        hsl2rgb(h, m1, m2),
        hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
        this.opacity
      );
    },
    displayable: function() {
      return (0 <= this.s && this.s <= 1 || isNaN(this.s))
          && (0 <= this.l && this.l <= 1)
          && (0 <= this.opacity && this.opacity <= 1);
    },
    formatHsl: function() {
      var a = this.opacity; a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
      return (a === 1 ? "hsl(" : "hsla(")
          + (this.h || 0) + ", "
          + (this.s || 0) * 100 + "%, "
          + (this.l || 0) * 100 + "%"
          + (a === 1 ? ")" : ", " + a + ")");
    }
  }));

  /* From FvD 13.37, CSS Color Module Level 3 */
  function hsl2rgb(h, m1, m2) {
    return (h < 60 ? m1 + (m2 - m1) * h / 60
        : h < 180 ? m2
        : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60
        : m1) * 255;
  }

  var deg2rad = Math.PI / 180;
  var rad2deg = 180 / Math.PI;

  // https://observablehq.com/@mbostock/lab-and-rgb
  var K = 18,
      Xn = 0.96422,
      Yn = 1,
      Zn = 0.82521,
      t0 = 4 / 29,
      t1 = 6 / 29,
      t2 = 3 * t1 * t1,
      t3 = t1 * t1 * t1;

  function labConvert(o) {
    if (o instanceof Lab) return new Lab(o.l, o.a, o.b, o.opacity);
    if (o instanceof Hcl) return hcl2lab(o);
    if (!(o instanceof Rgb)) o = rgbConvert(o);
    var r = rgb2lrgb(o.r),
        g = rgb2lrgb(o.g),
        b = rgb2lrgb(o.b),
        y = xyz2lab((0.2225045 * r + 0.7168786 * g + 0.0606169 * b) / Yn), x, z;
    if (r === g && g === b) x = z = y; else {
      x = xyz2lab((0.4360747 * r + 0.3850649 * g + 0.1430804 * b) / Xn);
      z = xyz2lab((0.0139322 * r + 0.0971045 * g + 0.7141733 * b) / Zn);
    }
    return new Lab(116 * y - 16, 500 * (x - y), 200 * (y - z), o.opacity);
  }

  function lab(l, a, b, opacity) {
    return arguments.length === 1 ? labConvert(l) : new Lab(l, a, b, opacity == null ? 1 : opacity);
  }

  function Lab(l, a, b, opacity) {
    this.l = +l;
    this.a = +a;
    this.b = +b;
    this.opacity = +opacity;
  }

  define(Lab, lab, extend(Color, {
    brighter: function(k) {
      return new Lab(this.l + K * (k == null ? 1 : k), this.a, this.b, this.opacity);
    },
    darker: function(k) {
      return new Lab(this.l - K * (k == null ? 1 : k), this.a, this.b, this.opacity);
    },
    rgb: function() {
      var y = (this.l + 16) / 116,
          x = isNaN(this.a) ? y : y + this.a / 500,
          z = isNaN(this.b) ? y : y - this.b / 200;
      x = Xn * lab2xyz(x);
      y = Yn * lab2xyz(y);
      z = Zn * lab2xyz(z);
      return new Rgb(
        lrgb2rgb( 3.1338561 * x - 1.6168667 * y - 0.4906146 * z),
        lrgb2rgb(-0.9787684 * x + 1.9161415 * y + 0.0334540 * z),
        lrgb2rgb( 0.0719453 * x - 0.2289914 * y + 1.4052427 * z),
        this.opacity
      );
    }
  }));

  function xyz2lab(t) {
    return t > t3 ? Math.pow(t, 1 / 3) : t / t2 + t0;
  }

  function lab2xyz(t) {
    return t > t1 ? t * t * t : t2 * (t - t0);
  }

  function lrgb2rgb(x) {
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  }

  function rgb2lrgb(x) {
    return (x /= 255) <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }

  function hclConvert(o) {
    if (o instanceof Hcl) return new Hcl(o.h, o.c, o.l, o.opacity);
    if (!(o instanceof Lab)) o = labConvert(o);
    if (o.a === 0 && o.b === 0) return new Hcl(NaN, 0 < o.l && o.l < 100 ? 0 : NaN, o.l, o.opacity);
    var h = Math.atan2(o.b, o.a) * rad2deg;
    return new Hcl(h < 0 ? h + 360 : h, Math.sqrt(o.a * o.a + o.b * o.b), o.l, o.opacity);
  }

  function hcl(h, c, l, opacity) {
    return arguments.length === 1 ? hclConvert(h) : new Hcl(h, c, l, opacity == null ? 1 : opacity);
  }

  function Hcl(h, c, l, opacity) {
    this.h = +h;
    this.c = +c;
    this.l = +l;
    this.opacity = +opacity;
  }

  function hcl2lab(o) {
    if (isNaN(o.h)) return new Lab(o.l, 0, 0, o.opacity);
    var h = o.h * deg2rad;
    return new Lab(o.l, Math.cos(h) * o.c, Math.sin(h) * o.c, o.opacity);
  }

  define(Hcl, hcl, extend(Color, {
    brighter: function(k) {
      return new Hcl(this.h, this.c, this.l + K * (k == null ? 1 : k), this.opacity);
    },
    darker: function(k) {
      return new Hcl(this.h, this.c, this.l - K * (k == null ? 1 : k), this.opacity);
    },
    rgb: function() {
      return hcl2lab(this).rgb();
    }
  }));

  var A = -0.14861,
      B = +1.78277,
      C = -0.29227,
      D = -0.90649,
      E = +1.97294,
      ED = E * D,
      EB = E * B,
      BC_DA = B * C - D * A;

  function cubehelixConvert(o) {
    if (o instanceof Cubehelix) return new Cubehelix(o.h, o.s, o.l, o.opacity);
    if (!(o instanceof Rgb)) o = rgbConvert(o);
    var r = o.r / 255,
        g = o.g / 255,
        b = o.b / 255,
        l = (BC_DA * b + ED * r - EB * g) / (BC_DA + ED - EB),
        bl = b - l,
        k = (E * (g - l) - C * bl) / D,
        s = Math.sqrt(k * k + bl * bl) / (E * l * (1 - l)), // NaN if l=0 or l=1
        h = s ? Math.atan2(k, bl) * rad2deg - 120 : NaN;
    return new Cubehelix(h < 0 ? h + 360 : h, s, l, o.opacity);
  }

  function cubehelix(h, s, l, opacity) {
    return arguments.length === 1 ? cubehelixConvert(h) : new Cubehelix(h, s, l, opacity == null ? 1 : opacity);
  }

  function Cubehelix(h, s, l, opacity) {
    this.h = +h;
    this.s = +s;
    this.l = +l;
    this.opacity = +opacity;
  }

  define(Cubehelix, cubehelix, extend(Color, {
    brighter: function(k) {
      k = k == null ? brighter : Math.pow(brighter, k);
      return new Cubehelix(this.h, this.s, this.l * k, this.opacity);
    },
    darker: function(k) {
      k = k == null ? darker : Math.pow(darker, k);
      return new Cubehelix(this.h, this.s, this.l * k, this.opacity);
    },
    rgb: function() {
      var h = isNaN(this.h) ? 0 : (this.h + 120) * deg2rad,
          l = +this.l,
          a = isNaN(this.s) ? 0 : this.s * l * (1 - l),
          cosh = Math.cos(h),
          sinh = Math.sin(h);
      return new Rgb(
        255 * (l + a * (A * cosh + B * sinh)),
        255 * (l + a * (C * cosh + D * sinh)),
        255 * (l + a * (E * cosh)),
        this.opacity
      );
    }
  }));

  function constant$1(x) {
    return function() {
      return x;
    };
  }

  function linear(a, d) {
    return function(t) {
      return a + t * d;
    };
  }

  function exponential(a, b, y) {
    return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
      return Math.pow(a + t * b, y);
    };
  }

  function hue(a, b) {
    var d = b - a;
    return d ? linear(a, d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d) : constant$1(isNaN(a) ? b : a);
  }

  function gamma(y) {
    return (y = +y) === 1 ? nogamma : function(a, b) {
      return b - a ? exponential(a, b, y) : constant$1(isNaN(a) ? b : a);
    };
  }

  function nogamma(a, b) {
    var d = b - a;
    return d ? linear(a, d) : constant$1(isNaN(a) ? b : a);
  }

  var interpolateRgb = (function rgbGamma(y) {
    var color = gamma(y);

    function rgb$1(start, end) {
      var r = color((start = rgb(start)).r, (end = rgb(end)).r),
          g = color(start.g, end.g),
          b = color(start.b, end.b),
          opacity = nogamma(start.opacity, end.opacity);
      return function(t) {
        start.r = r(t);
        start.g = g(t);
        start.b = b(t);
        start.opacity = opacity(t);
        return start + "";
      };
    }

    rgb$1.gamma = rgbGamma;

    return rgb$1;
  })(1);

  function numberArray(a, b) {
    if (!b) b = [];
    var n = a ? Math.min(b.length, a.length) : 0,
        c = b.slice(),
        i;
    return function(t) {
      for (i = 0; i < n; ++i) c[i] = a[i] * (1 - t) + b[i] * t;
      return c;
    };
  }

  function isNumberArray(x) {
    return ArrayBuffer.isView(x) && !(x instanceof DataView);
  }

  function genericArray(a, b) {
    var nb = b ? b.length : 0,
        na = a ? Math.min(nb, a.length) : 0,
        x = new Array(na),
        c = new Array(nb),
        i;

    for (i = 0; i < na; ++i) x[i] = interpolateValue(a[i], b[i]);
    for (; i < nb; ++i) c[i] = b[i];

    return function(t) {
      for (i = 0; i < na; ++i) c[i] = x[i](t);
      return c;
    };
  }

  function date(a, b) {
    var d = new Date;
    return a = +a, b = +b, function(t) {
      return d.setTime(a * (1 - t) + b * t), d;
    };
  }

  function interpolateNumber(a, b) {
    return a = +a, b = +b, function(t) {
      return a * (1 - t) + b * t;
    };
  }

  function object(a, b) {
    var i = {},
        c = {},
        k;

    if (a === null || typeof a !== "object") a = {};
    if (b === null || typeof b !== "object") b = {};

    for (k in b) {
      if (k in a) {
        i[k] = interpolateValue(a[k], b[k]);
      } else {
        c[k] = b[k];
      }
    }

    return function(t) {
      for (k in i) c[k] = i[k](t);
      return c;
    };
  }

  var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
      reB = new RegExp(reA.source, "g");

  function zero(b) {
    return function() {
      return b;
    };
  }

  function one(b) {
    return function(t) {
      return b(t) + "";
    };
  }

  function interpolateString(a, b) {
    var bi = reA.lastIndex = reB.lastIndex = 0, // scan index for next number in b
        am, // current match in a
        bm, // current match in b
        bs, // string preceding current number in b, if any
        i = -1, // index in s
        s = [], // string constants and placeholders
        q = []; // number interpolators

    // Coerce inputs to strings.
    a = a + "", b = b + "";

    // Interpolate pairs of numbers in a & b.
    while ((am = reA.exec(a))
        && (bm = reB.exec(b))) {
      if ((bs = bm.index) > bi) { // a string precedes the next number in b
        bs = b.slice(bi, bs);
        if (s[i]) s[i] += bs; // coalesce with previous string
        else s[++i] = bs;
      }
      if ((am = am[0]) === (bm = bm[0])) { // numbers in a & b match
        if (s[i]) s[i] += bm; // coalesce with previous string
        else s[++i] = bm;
      } else { // interpolate non-matching numbers
        s[++i] = null;
        q.push({i: i, x: interpolateNumber(am, bm)});
      }
      bi = reB.lastIndex;
    }

    // Add remains of b.
    if (bi < b.length) {
      bs = b.slice(bi);
      if (s[i]) s[i] += bs; // coalesce with previous string
      else s[++i] = bs;
    }

    // Special optimization for only a single match.
    // Otherwise, interpolate each of the numbers and rejoin the string.
    return s.length < 2 ? (q[0]
        ? one(q[0].x)
        : zero(b))
        : (b = q.length, function(t) {
            for (var i = 0, o; i < b; ++i) s[(o = q[i]).i] = o.x(t);
            return s.join("");
          });
  }

  function interpolateValue(a, b) {
    var t = typeof b, c;
    return b == null || t === "boolean" ? constant$1(b)
        : (t === "number" ? interpolateNumber
        : t === "string" ? ((c = color(b)) ? (b = c, interpolateRgb) : interpolateString)
        : b instanceof color ? interpolateRgb
        : b instanceof Date ? date
        : isNumberArray(b) ? numberArray
        : Array.isArray(b) ? genericArray
        : typeof b.valueOf !== "function" && typeof b.toString !== "function" || isNaN(b) ? object
        : interpolateNumber)(a, b);
  }

  function interpolateRound(a, b) {
    return a = +a, b = +b, function(t) {
      return Math.round(a * (1 - t) + b * t);
    };
  }

  var degrees = 180 / Math.PI;

  var identity = {
    translateX: 0,
    translateY: 0,
    rotate: 0,
    skewX: 0,
    scaleX: 1,
    scaleY: 1
  };

  function decompose(a, b, c, d, e, f) {
    var scaleX, scaleY, skewX;
    if (scaleX = Math.sqrt(a * a + b * b)) a /= scaleX, b /= scaleX;
    if (skewX = a * c + b * d) c -= a * skewX, d -= b * skewX;
    if (scaleY = Math.sqrt(c * c + d * d)) c /= scaleY, d /= scaleY, skewX /= scaleY;
    if (a * d < b * c) a = -a, b = -b, skewX = -skewX, scaleX = -scaleX;
    return {
      translateX: e,
      translateY: f,
      rotate: Math.atan2(b, a) * degrees,
      skewX: Math.atan(skewX) * degrees,
      scaleX: scaleX,
      scaleY: scaleY
    };
  }

  var cssNode,
      cssRoot,
      cssView,
      svgNode;

  function parseCss(value) {
    if (value === "none") return identity;
    if (!cssNode) cssNode = document.createElement("DIV"), cssRoot = document.documentElement, cssView = document.defaultView;
    cssNode.style.transform = value;
    value = cssView.getComputedStyle(cssRoot.appendChild(cssNode), null).getPropertyValue("transform");
    cssRoot.removeChild(cssNode);
    value = value.slice(7, -1).split(",");
    return decompose(+value[0], +value[1], +value[2], +value[3], +value[4], +value[5]);
  }

  function parseSvg(value) {
    if (value == null) return identity;
    if (!svgNode) svgNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgNode.setAttribute("transform", value);
    if (!(value = svgNode.transform.baseVal.consolidate())) return identity;
    value = value.matrix;
    return decompose(value.a, value.b, value.c, value.d, value.e, value.f);
  }

  function interpolateTransform(parse, pxComma, pxParen, degParen) {

    function pop(s) {
      return s.length ? s.pop() + " " : "";
    }

    function translate(xa, ya, xb, yb, s, q) {
      if (xa !== xb || ya !== yb) {
        var i = s.push("translate(", null, pxComma, null, pxParen);
        q.push({i: i - 4, x: interpolateNumber(xa, xb)}, {i: i - 2, x: interpolateNumber(ya, yb)});
      } else if (xb || yb) {
        s.push("translate(" + xb + pxComma + yb + pxParen);
      }
    }

    function rotate(a, b, s, q) {
      if (a !== b) {
        if (a - b > 180) b += 360; else if (b - a > 180) a += 360; // shortest path
        q.push({i: s.push(pop(s) + "rotate(", null, degParen) - 2, x: interpolateNumber(a, b)});
      } else if (b) {
        s.push(pop(s) + "rotate(" + b + degParen);
      }
    }

    function skewX(a, b, s, q) {
      if (a !== b) {
        q.push({i: s.push(pop(s) + "skewX(", null, degParen) - 2, x: interpolateNumber(a, b)});
      } else if (b) {
        s.push(pop(s) + "skewX(" + b + degParen);
      }
    }

    function scale(xa, ya, xb, yb, s, q) {
      if (xa !== xb || ya !== yb) {
        var i = s.push(pop(s) + "scale(", null, ",", null, ")");
        q.push({i: i - 4, x: interpolateNumber(xa, xb)}, {i: i - 2, x: interpolateNumber(ya, yb)});
      } else if (xb !== 1 || yb !== 1) {
        s.push(pop(s) + "scale(" + xb + "," + yb + ")");
      }
    }

    return function(a, b) {
      var s = [], // string constants and placeholders
          q = []; // number interpolators
      a = parse(a), b = parse(b);
      translate(a.translateX, a.translateY, b.translateX, b.translateY, s, q);
      rotate(a.rotate, b.rotate, s, q);
      skewX(a.skewX, b.skewX, s, q);
      scale(a.scaleX, a.scaleY, b.scaleX, b.scaleY, s, q);
      a = b = null; // gc
      return function(t) {
        var i = -1, n = q.length, o;
        while (++i < n) s[(o = q[i]).i] = o.x(t);
        return s.join("");
      };
    };
  }

  var interpolateTransformCss = interpolateTransform(parseCss, "px, ", "px)", "deg)");
  var interpolateTransformSvg = interpolateTransform(parseSvg, ", ", ")", ")");

  function cubehelix$1(hue) {
    return (function cubehelixGamma(y) {
      y = +y;

      function cubehelix$1(start, end) {
        var h = hue((start = cubehelix(start)).h, (end = cubehelix(end)).h),
            s = nogamma(start.s, end.s),
            l = nogamma(start.l, end.l),
            opacity = nogamma(start.opacity, end.opacity);
        return function(t) {
          start.h = h(t);
          start.s = s(t);
          start.l = l(Math.pow(t, y));
          start.opacity = opacity(t);
          return start + "";
        };
      }

      cubehelix$1.gamma = cubehelixGamma;

      return cubehelix$1;
    })(1);
  }

  cubehelix$1(hue);
  var cubehelixLong = cubehelix$1(nogamma);

  function constant$2(x) {
    return function() {
      return x;
    };
  }

  function number(x) {
    return +x;
  }

  var unit = [0, 1];

  function deinterpolateLinear(a, b) {
    return (b -= (a = +a))
        ? function(x) { return (x - a) / b; }
        : constant$2(b);
  }

  function deinterpolateClamp(deinterpolate) {
    return function(a, b) {
      var d = deinterpolate(a = +a, b = +b);
      return function(x) { return x <= a ? 0 : x >= b ? 1 : d(x); };
    };
  }

  function reinterpolateClamp(reinterpolate) {
    return function(a, b) {
      var r = reinterpolate(a = +a, b = +b);
      return function(t) { return t <= 0 ? a : t >= 1 ? b : r(t); };
    };
  }

  function bimap(domain, range, deinterpolate, reinterpolate) {
    var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
    if (d1 < d0) d0 = deinterpolate(d1, d0), r0 = reinterpolate(r1, r0);
    else d0 = deinterpolate(d0, d1), r0 = reinterpolate(r0, r1);
    return function(x) { return r0(d0(x)); };
  }

  function polymap(domain, range, deinterpolate, reinterpolate) {
    var j = Math.min(domain.length, range.length) - 1,
        d = new Array(j),
        r = new Array(j),
        i = -1;

    // Reverse descending domains.
    if (domain[j] < domain[0]) {
      domain = domain.slice().reverse();
      range = range.slice().reverse();
    }

    while (++i < j) {
      d[i] = deinterpolate(domain[i], domain[i + 1]);
      r[i] = reinterpolate(range[i], range[i + 1]);
    }

    return function(x) {
      var i = bisectRight(domain, x, 1, j) - 1;
      return r[i](d[i](x));
    };
  }

  function copy(source, target) {
    return target
        .domain(source.domain())
        .range(source.range())
        .interpolate(source.interpolate())
        .clamp(source.clamp());
  }

  // deinterpolate(a, b)(x) takes a domain value x in [a,b] and returns the corresponding parameter t in [0,1].
  // reinterpolate(a, b)(t) takes a parameter t in [0,1] and returns the corresponding domain value x in [a,b].
  function continuous(deinterpolate, reinterpolate) {
    var domain = unit,
        range = unit,
        interpolate = interpolateValue,
        clamp = false,
        piecewise,
        output,
        input;

    function rescale() {
      piecewise = Math.min(domain.length, range.length) > 2 ? polymap : bimap;
      output = input = null;
      return scale;
    }

    function scale(x) {
      return (output || (output = piecewise(domain, range, clamp ? deinterpolateClamp(deinterpolate) : deinterpolate, interpolate)))(+x);
    }

    scale.invert = function(y) {
      return (input || (input = piecewise(range, domain, deinterpolateLinear, clamp ? reinterpolateClamp(reinterpolate) : reinterpolate)))(+y);
    };

    scale.domain = function(_) {
      return arguments.length ? (domain = map$1.call(_, number), rescale()) : domain.slice();
    };

    scale.range = function(_) {
      return arguments.length ? (range = slice.call(_), rescale()) : range.slice();
    };

    scale.rangeRound = function(_) {
      return range = slice.call(_), interpolate = interpolateRound, rescale();
    };

    scale.clamp = function(_) {
      return arguments.length ? (clamp = !!_, rescale()) : clamp;
    };

    scale.interpolate = function(_) {
      return arguments.length ? (interpolate = _, rescale()) : interpolate;
    };

    return rescale();
  }

  function formatDecimal(x) {
    return Math.abs(x = Math.round(x)) >= 1e21
        ? x.toLocaleString("en").replace(/,/g, "")
        : x.toString(10);
  }

  // Computes the decimal coefficient and exponent of the specified number x with
  // significant digits p, where x is positive and p is in [1, 21] or undefined.
  // For example, formatDecimalParts(1.23) returns ["123", 0].
  function formatDecimalParts(x, p) {
    if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
    var i, coefficient = x.slice(0, i);

    // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
    // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
    return [
      coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
      +x.slice(i + 1)
    ];
  }

  function exponent(x) {
    return x = formatDecimalParts(Math.abs(x)), x ? x[1] : NaN;
  }

  function formatGroup(grouping, thousands) {
    return function(value, width) {
      var i = value.length,
          t = [],
          j = 0,
          g = grouping[0],
          length = 0;

      while (i > 0 && g > 0) {
        if (length + g + 1 > width) g = Math.max(1, width - length);
        t.push(value.substring(i -= g, i + g));
        if ((length += g + 1) > width) break;
        g = grouping[j = (j + 1) % grouping.length];
      }

      return t.reverse().join(thousands);
    };
  }

  function formatNumerals(numerals) {
    return function(value) {
      return value.replace(/[0-9]/g, function(i) {
        return numerals[+i];
      });
    };
  }

  // [[fill]align][sign][symbol][0][width][,][.precision][~][type]
  var re = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

  function formatSpecifier(specifier) {
    if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);
    var match;
    return new FormatSpecifier({
      fill: match[1],
      align: match[2],
      sign: match[3],
      symbol: match[4],
      zero: match[5],
      width: match[6],
      comma: match[7],
      precision: match[8] && match[8].slice(1),
      trim: match[9],
      type: match[10]
    });
  }

  formatSpecifier.prototype = FormatSpecifier.prototype; // instanceof

  function FormatSpecifier(specifier) {
    this.fill = specifier.fill === undefined ? " " : specifier.fill + "";
    this.align = specifier.align === undefined ? ">" : specifier.align + "";
    this.sign = specifier.sign === undefined ? "-" : specifier.sign + "";
    this.symbol = specifier.symbol === undefined ? "" : specifier.symbol + "";
    this.zero = !!specifier.zero;
    this.width = specifier.width === undefined ? undefined : +specifier.width;
    this.comma = !!specifier.comma;
    this.precision = specifier.precision === undefined ? undefined : +specifier.precision;
    this.trim = !!specifier.trim;
    this.type = specifier.type === undefined ? "" : specifier.type + "";
  }

  FormatSpecifier.prototype.toString = function() {
    return this.fill
        + this.align
        + this.sign
        + this.symbol
        + (this.zero ? "0" : "")
        + (this.width === undefined ? "" : Math.max(1, this.width | 0))
        + (this.comma ? "," : "")
        + (this.precision === undefined ? "" : "." + Math.max(0, this.precision | 0))
        + (this.trim ? "~" : "")
        + this.type;
  };

  // Trims insignificant zeros, e.g., replaces 1.2000k with 1.2k.
  function formatTrim(s) {
    out: for (var n = s.length, i = 1, i0 = -1, i1; i < n; ++i) {
      switch (s[i]) {
        case ".": i0 = i1 = i; break;
        case "0": if (i0 === 0) i0 = i; i1 = i; break;
        default: if (!+s[i]) break out; if (i0 > 0) i0 = 0; break;
      }
    }
    return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
  }

  var prefixExponent;

  function formatPrefixAuto(x, p) {
    var d = formatDecimalParts(x, p);
    if (!d) return x + "";
    var coefficient = d[0],
        exponent = d[1],
        i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
        n = coefficient.length;
    return i === n ? coefficient
        : i > n ? coefficient + new Array(i - n + 1).join("0")
        : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
        : "0." + new Array(1 - i).join("0") + formatDecimalParts(x, Math.max(0, p + i - 1))[0]; // less than 1y!
  }

  function formatRounded(x, p) {
    var d = formatDecimalParts(x, p);
    if (!d) return x + "";
    var coefficient = d[0],
        exponent = d[1];
    return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
        : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
        : coefficient + new Array(exponent - coefficient.length + 2).join("0");
  }

  var formatTypes = {
    "%": function(x, p) { return (x * 100).toFixed(p); },
    "b": function(x) { return Math.round(x).toString(2); },
    "c": function(x) { return x + ""; },
    "d": formatDecimal,
    "e": function(x, p) { return x.toExponential(p); },
    "f": function(x, p) { return x.toFixed(p); },
    "g": function(x, p) { return x.toPrecision(p); },
    "o": function(x) { return Math.round(x).toString(8); },
    "p": function(x, p) { return formatRounded(x * 100, p); },
    "r": formatRounded,
    "s": formatPrefixAuto,
    "X": function(x) { return Math.round(x).toString(16).toUpperCase(); },
    "x": function(x) { return Math.round(x).toString(16); }
  };

  function identity$1(x) {
    return x;
  }

  var map$2 = Array.prototype.map,
      prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

  function formatLocale(locale) {
    var group = locale.grouping === undefined || locale.thousands === undefined ? identity$1 : formatGroup(map$2.call(locale.grouping, Number), locale.thousands + ""),
        currencyPrefix = locale.currency === undefined ? "" : locale.currency[0] + "",
        currencySuffix = locale.currency === undefined ? "" : locale.currency[1] + "",
        decimal = locale.decimal === undefined ? "." : locale.decimal + "",
        numerals = locale.numerals === undefined ? identity$1 : formatNumerals(map$2.call(locale.numerals, String)),
        percent = locale.percent === undefined ? "%" : locale.percent + "",
        minus = locale.minus === undefined ? "-" : locale.minus + "",
        nan = locale.nan === undefined ? "NaN" : locale.nan + "";

    function newFormat(specifier) {
      specifier = formatSpecifier(specifier);

      var fill = specifier.fill,
          align = specifier.align,
          sign = specifier.sign,
          symbol = specifier.symbol,
          zero = specifier.zero,
          width = specifier.width,
          comma = specifier.comma,
          precision = specifier.precision,
          trim = specifier.trim,
          type = specifier.type;

      // The "n" type is an alias for ",g".
      if (type === "n") comma = true, type = "g";

      // The "" type, and any invalid type, is an alias for ".12~g".
      else if (!formatTypes[type]) precision === undefined && (precision = 12), trim = true, type = "g";

      // If zero fill is specified, padding goes after sign and before digits.
      if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

      // Compute the prefix and suffix.
      // For SI-prefix, the suffix is lazily computed.
      var prefix = symbol === "$" ? currencyPrefix : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
          suffix = symbol === "$" ? currencySuffix : /[%p]/.test(type) ? percent : "";

      // What format function should we use?
      // Is this an integer type?
      // Can this type generate exponential notation?
      var formatType = formatTypes[type],
          maybeSuffix = /[defgprs%]/.test(type);

      // Set the default precision if not specified,
      // or clamp the specified precision to the supported range.
      // For significant precision, it must be in [1, 21].
      // For fixed precision, it must be in [0, 20].
      precision = precision === undefined ? 6
          : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
          : Math.max(0, Math.min(20, precision));

      function format(value) {
        var valuePrefix = prefix,
            valueSuffix = suffix,
            i, n, c;

        if (type === "c") {
          valueSuffix = formatType(value) + valueSuffix;
          value = "";
        } else {
          value = +value;

          // Determine the sign. -0 is not less than 0, but 1 / -0 is!
          var valueNegative = value < 0 || 1 / value < 0;

          // Perform the initial formatting.
          value = isNaN(value) ? nan : formatType(Math.abs(value), precision);

          // Trim insignificant zeros.
          if (trim) value = formatTrim(value);

          // If a negative value rounds to zero after formatting, and no explicit positive sign is requested, hide the sign.
          if (valueNegative && +value === 0 && sign !== "+") valueNegative = false;

          // Compute the prefix and suffix.
          valuePrefix = (valueNegative ? (sign === "(" ? sign : minus) : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
          valueSuffix = (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + valueSuffix + (valueNegative && sign === "(" ? ")" : "");

          // Break the formatted value into the integer “value” part that can be
          // grouped, and fractional or exponential “suffix” part that is not.
          if (maybeSuffix) {
            i = -1, n = value.length;
            while (++i < n) {
              if (c = value.charCodeAt(i), 48 > c || c > 57) {
                valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
                value = value.slice(0, i);
                break;
              }
            }
          }
        }

        // If the fill character is not "0", grouping is applied before padding.
        if (comma && !zero) value = group(value, Infinity);

        // Compute the padding.
        var length = valuePrefix.length + value.length + valueSuffix.length,
            padding = length < width ? new Array(width - length + 1).join(fill) : "";

        // If the fill character is "0", grouping is applied after padding.
        if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

        // Reconstruct the final output based on the desired alignment.
        switch (align) {
          case "<": value = valuePrefix + value + valueSuffix + padding; break;
          case "=": value = valuePrefix + padding + value + valueSuffix; break;
          case "^": value = padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length); break;
          default: value = padding + valuePrefix + value + valueSuffix; break;
        }

        return numerals(value);
      }

      format.toString = function() {
        return specifier + "";
      };

      return format;
    }

    function formatPrefix(specifier, value) {
      var f = newFormat((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
          e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
          k = Math.pow(10, -e),
          prefix = prefixes[8 + e / 3];
      return function(value) {
        return f(k * value) + prefix;
      };
    }

    return {
      format: newFormat,
      formatPrefix: formatPrefix
    };
  }

  var locale;
  var format;
  var formatPrefix;

  defaultLocale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["$", ""],
    minus: "-"
  });

  function defaultLocale(definition) {
    locale = formatLocale(definition);
    format = locale.format;
    formatPrefix = locale.formatPrefix;
    return locale;
  }

  function precisionFixed(step) {
    return Math.max(0, -exponent(Math.abs(step)));
  }

  function precisionPrefix(step, value) {
    return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
  }

  function precisionRound(step, max) {
    step = Math.abs(step), max = Math.abs(max) - step;
    return Math.max(0, exponent(max) - exponent(step)) + 1;
  }

  function tickFormat(domain, count, specifier) {
    var start = domain[0],
        stop = domain[domain.length - 1],
        step = tickStep(start, stop, count == null ? 10 : count),
        precision;
    specifier = formatSpecifier(specifier == null ? ",f" : specifier);
    switch (specifier.type) {
      case "s": {
        var value = Math.max(Math.abs(start), Math.abs(stop));
        if (specifier.precision == null && !isNaN(precision = precisionPrefix(step, value))) specifier.precision = precision;
        return formatPrefix(specifier, value);
      }
      case "":
      case "e":
      case "g":
      case "p":
      case "r": {
        if (specifier.precision == null && !isNaN(precision = precisionRound(step, Math.max(Math.abs(start), Math.abs(stop))))) specifier.precision = precision - (specifier.type === "e");
        break;
      }
      case "f":
      case "%": {
        if (specifier.precision == null && !isNaN(precision = precisionFixed(step))) specifier.precision = precision - (specifier.type === "%") * 2;
        break;
      }
    }
    return format(specifier);
  }

  function linearish(scale) {
    var domain = scale.domain;

    scale.ticks = function(count) {
      var d = domain();
      return ticks(d[0], d[d.length - 1], count == null ? 10 : count);
    };

    scale.tickFormat = function(count, specifier) {
      return tickFormat(domain(), count, specifier);
    };

    scale.nice = function(count) {
      if (count == null) count = 10;

      var d = domain(),
          i0 = 0,
          i1 = d.length - 1,
          start = d[i0],
          stop = d[i1],
          step;

      if (stop < start) {
        step = start, start = stop, stop = step;
        step = i0, i0 = i1, i1 = step;
      }

      step = tickIncrement(start, stop, count);

      if (step > 0) {
        start = Math.floor(start / step) * step;
        stop = Math.ceil(stop / step) * step;
        step = tickIncrement(start, stop, count);
      } else if (step < 0) {
        start = Math.ceil(start * step) / step;
        stop = Math.floor(stop * step) / step;
        step = tickIncrement(start, stop, count);
      }

      if (step > 0) {
        d[i0] = Math.floor(start / step) * step;
        d[i1] = Math.ceil(stop / step) * step;
        domain(d);
      } else if (step < 0) {
        d[i0] = Math.ceil(start * step) / step;
        d[i1] = Math.floor(stop * step) / step;
        domain(d);
      }

      return scale;
    };

    return scale;
  }

  function linear$1() {
    var scale = continuous(deinterpolateLinear, interpolateNumber);

    scale.copy = function() {
      return copy(scale, linear$1());
    };

    return linearish(scale);
  }

  var t0$1 = new Date,
      t1$1 = new Date;

  function newInterval(floori, offseti, count, field) {

    function interval(date) {
      return floori(date = arguments.length === 0 ? new Date : new Date(+date)), date;
    }

    interval.floor = function(date) {
      return floori(date = new Date(+date)), date;
    };

    interval.ceil = function(date) {
      return floori(date = new Date(date - 1)), offseti(date, 1), floori(date), date;
    };

    interval.round = function(date) {
      var d0 = interval(date),
          d1 = interval.ceil(date);
      return date - d0 < d1 - date ? d0 : d1;
    };

    interval.offset = function(date, step) {
      return offseti(date = new Date(+date), step == null ? 1 : Math.floor(step)), date;
    };

    interval.range = function(start, stop, step) {
      var range = [], previous;
      start = interval.ceil(start);
      step = step == null ? 1 : Math.floor(step);
      if (!(start < stop) || !(step > 0)) return range; // also handles Invalid Date
      do range.push(previous = new Date(+start)), offseti(start, step), floori(start);
      while (previous < start && start < stop);
      return range;
    };

    interval.filter = function(test) {
      return newInterval(function(date) {
        if (date >= date) while (floori(date), !test(date)) date.setTime(date - 1);
      }, function(date, step) {
        if (date >= date) {
          if (step < 0) while (++step <= 0) {
            while (offseti(date, -1), !test(date)) {} // eslint-disable-line no-empty
          } else while (--step >= 0) {
            while (offseti(date, +1), !test(date)) {} // eslint-disable-line no-empty
          }
        }
      });
    };

    if (count) {
      interval.count = function(start, end) {
        t0$1.setTime(+start), t1$1.setTime(+end);
        floori(t0$1), floori(t1$1);
        return Math.floor(count(t0$1, t1$1));
      };

      interval.every = function(step) {
        step = Math.floor(step);
        return !isFinite(step) || !(step > 0) ? null
            : !(step > 1) ? interval
            : interval.filter(field
                ? function(d) { return field(d) % step === 0; }
                : function(d) { return interval.count(0, d) % step === 0; });
      };
    }

    return interval;
  }

  var millisecond = newInterval(function() {
    // noop
  }, function(date, step) {
    date.setTime(+date + step);
  }, function(start, end) {
    return end - start;
  });

  // An optimized implementation for this simple case.
  millisecond.every = function(k) {
    k = Math.floor(k);
    if (!isFinite(k) || !(k > 0)) return null;
    if (!(k > 1)) return millisecond;
    return newInterval(function(date) {
      date.setTime(Math.floor(date / k) * k);
    }, function(date, step) {
      date.setTime(+date + step * k);
    }, function(start, end) {
      return (end - start) / k;
    });
  };

  var durationSecond = 1e3;
  var durationMinute = 6e4;
  var durationHour = 36e5;
  var durationDay = 864e5;
  var durationWeek = 6048e5;

  var second = newInterval(function(date) {
    date.setTime(date - date.getMilliseconds());
  }, function(date, step) {
    date.setTime(+date + step * durationSecond);
  }, function(start, end) {
    return (end - start) / durationSecond;
  }, function(date) {
    return date.getUTCSeconds();
  });

  var minute = newInterval(function(date) {
    date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond);
  }, function(date, step) {
    date.setTime(+date + step * durationMinute);
  }, function(start, end) {
    return (end - start) / durationMinute;
  }, function(date) {
    return date.getMinutes();
  });

  var hour = newInterval(function(date) {
    date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond - date.getMinutes() * durationMinute);
  }, function(date, step) {
    date.setTime(+date + step * durationHour);
  }, function(start, end) {
    return (end - start) / durationHour;
  }, function(date) {
    return date.getHours();
  });

  var day = newInterval(function(date) {
    date.setHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setDate(date.getDate() + step);
  }, function(start, end) {
    return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationDay;
  }, function(date) {
    return date.getDate() - 1;
  });

  function weekday(i) {
    return newInterval(function(date) {
      date.setDate(date.getDate() - (date.getDay() + 7 - i) % 7);
      date.setHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setDate(date.getDate() + step * 7);
    }, function(start, end) {
      return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationWeek;
    });
  }

  var sunday = weekday(0);
  var monday = weekday(1);
  var tuesday = weekday(2);
  var wednesday = weekday(3);
  var thursday = weekday(4);
  var friday = weekday(5);
  var saturday = weekday(6);

  var month = newInterval(function(date) {
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setMonth(date.getMonth() + step);
  }, function(start, end) {
    return end.getMonth() - start.getMonth() + (end.getFullYear() - start.getFullYear()) * 12;
  }, function(date) {
    return date.getMonth();
  });

  var year = newInterval(function(date) {
    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setFullYear(date.getFullYear() + step);
  }, function(start, end) {
    return end.getFullYear() - start.getFullYear();
  }, function(date) {
    return date.getFullYear();
  });

  // An optimized implementation for this simple case.
  year.every = function(k) {
    return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
      date.setFullYear(Math.floor(date.getFullYear() / k) * k);
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setFullYear(date.getFullYear() + step * k);
    });
  };

  var utcMinute = newInterval(function(date) {
    date.setUTCSeconds(0, 0);
  }, function(date, step) {
    date.setTime(+date + step * durationMinute);
  }, function(start, end) {
    return (end - start) / durationMinute;
  }, function(date) {
    return date.getUTCMinutes();
  });

  var utcHour = newInterval(function(date) {
    date.setUTCMinutes(0, 0, 0);
  }, function(date, step) {
    date.setTime(+date + step * durationHour);
  }, function(start, end) {
    return (end - start) / durationHour;
  }, function(date) {
    return date.getUTCHours();
  });

  var utcDay = newInterval(function(date) {
    date.setUTCHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setUTCDate(date.getUTCDate() + step);
  }, function(start, end) {
    return (end - start) / durationDay;
  }, function(date) {
    return date.getUTCDate() - 1;
  });

  function utcWeekday(i) {
    return newInterval(function(date) {
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 7 - i) % 7);
      date.setUTCHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setUTCDate(date.getUTCDate() + step * 7);
    }, function(start, end) {
      return (end - start) / durationWeek;
    });
  }

  var utcSunday = utcWeekday(0);
  var utcMonday = utcWeekday(1);
  var utcTuesday = utcWeekday(2);
  var utcWednesday = utcWeekday(3);
  var utcThursday = utcWeekday(4);
  var utcFriday = utcWeekday(5);
  var utcSaturday = utcWeekday(6);

  var utcMonth = newInterval(function(date) {
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setUTCMonth(date.getUTCMonth() + step);
  }, function(start, end) {
    return end.getUTCMonth() - start.getUTCMonth() + (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
  }, function(date) {
    return date.getUTCMonth();
  });

  var utcYear = newInterval(function(date) {
    date.setUTCMonth(0, 1);
    date.setUTCHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setUTCFullYear(date.getUTCFullYear() + step);
  }, function(start, end) {
    return end.getUTCFullYear() - start.getUTCFullYear();
  }, function(date) {
    return date.getUTCFullYear();
  });

  // An optimized implementation for this simple case.
  utcYear.every = function(k) {
    return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
      date.setUTCFullYear(Math.floor(date.getUTCFullYear() / k) * k);
      date.setUTCMonth(0, 1);
      date.setUTCHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setUTCFullYear(date.getUTCFullYear() + step * k);
    });
  };

  function localDate(d) {
    if (0 <= d.y && d.y < 100) {
      var date = new Date(-1, d.m, d.d, d.H, d.M, d.S, d.L);
      date.setFullYear(d.y);
      return date;
    }
    return new Date(d.y, d.m, d.d, d.H, d.M, d.S, d.L);
  }

  function utcDate(d) {
    if (0 <= d.y && d.y < 100) {
      var date = new Date(Date.UTC(-1, d.m, d.d, d.H, d.M, d.S, d.L));
      date.setUTCFullYear(d.y);
      return date;
    }
    return new Date(Date.UTC(d.y, d.m, d.d, d.H, d.M, d.S, d.L));
  }

  function newDate(y, m, d) {
    return {y: y, m: m, d: d, H: 0, M: 0, S: 0, L: 0};
  }

  function formatLocale$1(locale) {
    var locale_dateTime = locale.dateTime,
        locale_date = locale.date,
        locale_time = locale.time,
        locale_periods = locale.periods,
        locale_weekdays = locale.days,
        locale_shortWeekdays = locale.shortDays,
        locale_months = locale.months,
        locale_shortMonths = locale.shortMonths;

    var periodRe = formatRe(locale_periods),
        periodLookup = formatLookup(locale_periods),
        weekdayRe = formatRe(locale_weekdays),
        weekdayLookup = formatLookup(locale_weekdays),
        shortWeekdayRe = formatRe(locale_shortWeekdays),
        shortWeekdayLookup = formatLookup(locale_shortWeekdays),
        monthRe = formatRe(locale_months),
        monthLookup = formatLookup(locale_months),
        shortMonthRe = formatRe(locale_shortMonths),
        shortMonthLookup = formatLookup(locale_shortMonths);

    var formats = {
      "a": formatShortWeekday,
      "A": formatWeekday,
      "b": formatShortMonth,
      "B": formatMonth,
      "c": null,
      "d": formatDayOfMonth,
      "e": formatDayOfMonth,
      "f": formatMicroseconds,
      "g": formatYearISO,
      "G": formatFullYearISO,
      "H": formatHour24,
      "I": formatHour12,
      "j": formatDayOfYear,
      "L": formatMilliseconds,
      "m": formatMonthNumber,
      "M": formatMinutes,
      "p": formatPeriod,
      "q": formatQuarter,
      "Q": formatUnixTimestamp,
      "s": formatUnixTimestampSeconds,
      "S": formatSeconds,
      "u": formatWeekdayNumberMonday,
      "U": formatWeekNumberSunday,
      "V": formatWeekNumberISO,
      "w": formatWeekdayNumberSunday,
      "W": formatWeekNumberMonday,
      "x": null,
      "X": null,
      "y": formatYear,
      "Y": formatFullYear,
      "Z": formatZone,
      "%": formatLiteralPercent
    };

    var utcFormats = {
      "a": formatUTCShortWeekday,
      "A": formatUTCWeekday,
      "b": formatUTCShortMonth,
      "B": formatUTCMonth,
      "c": null,
      "d": formatUTCDayOfMonth,
      "e": formatUTCDayOfMonth,
      "f": formatUTCMicroseconds,
      "g": formatUTCYearISO,
      "G": formatUTCFullYearISO,
      "H": formatUTCHour24,
      "I": formatUTCHour12,
      "j": formatUTCDayOfYear,
      "L": formatUTCMilliseconds,
      "m": formatUTCMonthNumber,
      "M": formatUTCMinutes,
      "p": formatUTCPeriod,
      "q": formatUTCQuarter,
      "Q": formatUnixTimestamp,
      "s": formatUnixTimestampSeconds,
      "S": formatUTCSeconds,
      "u": formatUTCWeekdayNumberMonday,
      "U": formatUTCWeekNumberSunday,
      "V": formatUTCWeekNumberISO,
      "w": formatUTCWeekdayNumberSunday,
      "W": formatUTCWeekNumberMonday,
      "x": null,
      "X": null,
      "y": formatUTCYear,
      "Y": formatUTCFullYear,
      "Z": formatUTCZone,
      "%": formatLiteralPercent
    };

    var parses = {
      "a": parseShortWeekday,
      "A": parseWeekday,
      "b": parseShortMonth,
      "B": parseMonth,
      "c": parseLocaleDateTime,
      "d": parseDayOfMonth,
      "e": parseDayOfMonth,
      "f": parseMicroseconds,
      "g": parseYear,
      "G": parseFullYear,
      "H": parseHour24,
      "I": parseHour24,
      "j": parseDayOfYear,
      "L": parseMilliseconds,
      "m": parseMonthNumber,
      "M": parseMinutes,
      "p": parsePeriod,
      "q": parseQuarter,
      "Q": parseUnixTimestamp,
      "s": parseUnixTimestampSeconds,
      "S": parseSeconds,
      "u": parseWeekdayNumberMonday,
      "U": parseWeekNumberSunday,
      "V": parseWeekNumberISO,
      "w": parseWeekdayNumberSunday,
      "W": parseWeekNumberMonday,
      "x": parseLocaleDate,
      "X": parseLocaleTime,
      "y": parseYear,
      "Y": parseFullYear,
      "Z": parseZone,
      "%": parseLiteralPercent
    };

    // These recursive directive definitions must be deferred.
    formats.x = newFormat(locale_date, formats);
    formats.X = newFormat(locale_time, formats);
    formats.c = newFormat(locale_dateTime, formats);
    utcFormats.x = newFormat(locale_date, utcFormats);
    utcFormats.X = newFormat(locale_time, utcFormats);
    utcFormats.c = newFormat(locale_dateTime, utcFormats);

    function newFormat(specifier, formats) {
      return function(date) {
        var string = [],
            i = -1,
            j = 0,
            n = specifier.length,
            c,
            pad,
            format;

        if (!(date instanceof Date)) date = new Date(+date);

        while (++i < n) {
          if (specifier.charCodeAt(i) === 37) {
            string.push(specifier.slice(j, i));
            if ((pad = pads[c = specifier.charAt(++i)]) != null) c = specifier.charAt(++i);
            else pad = c === "e" ? " " : "0";
            if (format = formats[c]) c = format(date, pad);
            string.push(c);
            j = i + 1;
          }
        }

        string.push(specifier.slice(j, i));
        return string.join("");
      };
    }

    function newParse(specifier, Z) {
      return function(string) {
        var d = newDate(1900, undefined, 1),
            i = parseSpecifier(d, specifier, string += "", 0),
            week, day$1;
        if (i != string.length) return null;

        // If a UNIX timestamp is specified, return it.
        if ("Q" in d) return new Date(d.Q);
        if ("s" in d) return new Date(d.s * 1000 + ("L" in d ? d.L : 0));

        // If this is utcParse, never use the local timezone.
        if (Z && !("Z" in d)) d.Z = 0;

        // The am-pm flag is 0 for AM, and 1 for PM.
        if ("p" in d) d.H = d.H % 12 + d.p * 12;

        // If the month was not specified, inherit from the quarter.
        if (d.m === undefined) d.m = "q" in d ? d.q : 0;

        // Convert day-of-week and week-of-year to day-of-year.
        if ("V" in d) {
          if (d.V < 1 || d.V > 53) return null;
          if (!("w" in d)) d.w = 1;
          if ("Z" in d) {
            week = utcDate(newDate(d.y, 0, 1)), day$1 = week.getUTCDay();
            week = day$1 > 4 || day$1 === 0 ? utcMonday.ceil(week) : utcMonday(week);
            week = utcDay.offset(week, (d.V - 1) * 7);
            d.y = week.getUTCFullYear();
            d.m = week.getUTCMonth();
            d.d = week.getUTCDate() + (d.w + 6) % 7;
          } else {
            week = localDate(newDate(d.y, 0, 1)), day$1 = week.getDay();
            week = day$1 > 4 || day$1 === 0 ? monday.ceil(week) : monday(week);
            week = day.offset(week, (d.V - 1) * 7);
            d.y = week.getFullYear();
            d.m = week.getMonth();
            d.d = week.getDate() + (d.w + 6) % 7;
          }
        } else if ("W" in d || "U" in d) {
          if (!("w" in d)) d.w = "u" in d ? d.u % 7 : "W" in d ? 1 : 0;
          day$1 = "Z" in d ? utcDate(newDate(d.y, 0, 1)).getUTCDay() : localDate(newDate(d.y, 0, 1)).getDay();
          d.m = 0;
          d.d = "W" in d ? (d.w + 6) % 7 + d.W * 7 - (day$1 + 5) % 7 : d.w + d.U * 7 - (day$1 + 6) % 7;
        }

        // If a time zone is specified, all fields are interpreted as UTC and then
        // offset according to the specified time zone.
        if ("Z" in d) {
          d.H += d.Z / 100 | 0;
          d.M += d.Z % 100;
          return utcDate(d);
        }

        // Otherwise, all fields are in local time.
        return localDate(d);
      };
    }

    function parseSpecifier(d, specifier, string, j) {
      var i = 0,
          n = specifier.length,
          m = string.length,
          c,
          parse;

      while (i < n) {
        if (j >= m) return -1;
        c = specifier.charCodeAt(i++);
        if (c === 37) {
          c = specifier.charAt(i++);
          parse = parses[c in pads ? specifier.charAt(i++) : c];
          if (!parse || ((j = parse(d, string, j)) < 0)) return -1;
        } else if (c != string.charCodeAt(j++)) {
          return -1;
        }
      }

      return j;
    }

    function parsePeriod(d, string, i) {
      var n = periodRe.exec(string.slice(i));
      return n ? (d.p = periodLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseShortWeekday(d, string, i) {
      var n = shortWeekdayRe.exec(string.slice(i));
      return n ? (d.w = shortWeekdayLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseWeekday(d, string, i) {
      var n = weekdayRe.exec(string.slice(i));
      return n ? (d.w = weekdayLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseShortMonth(d, string, i) {
      var n = shortMonthRe.exec(string.slice(i));
      return n ? (d.m = shortMonthLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseMonth(d, string, i) {
      var n = monthRe.exec(string.slice(i));
      return n ? (d.m = monthLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseLocaleDateTime(d, string, i) {
      return parseSpecifier(d, locale_dateTime, string, i);
    }

    function parseLocaleDate(d, string, i) {
      return parseSpecifier(d, locale_date, string, i);
    }

    function parseLocaleTime(d, string, i) {
      return parseSpecifier(d, locale_time, string, i);
    }

    function formatShortWeekday(d) {
      return locale_shortWeekdays[d.getDay()];
    }

    function formatWeekday(d) {
      return locale_weekdays[d.getDay()];
    }

    function formatShortMonth(d) {
      return locale_shortMonths[d.getMonth()];
    }

    function formatMonth(d) {
      return locale_months[d.getMonth()];
    }

    function formatPeriod(d) {
      return locale_periods[+(d.getHours() >= 12)];
    }

    function formatQuarter(d) {
      return 1 + ~~(d.getMonth() / 3);
    }

    function formatUTCShortWeekday(d) {
      return locale_shortWeekdays[d.getUTCDay()];
    }

    function formatUTCWeekday(d) {
      return locale_weekdays[d.getUTCDay()];
    }

    function formatUTCShortMonth(d) {
      return locale_shortMonths[d.getUTCMonth()];
    }

    function formatUTCMonth(d) {
      return locale_months[d.getUTCMonth()];
    }

    function formatUTCPeriod(d) {
      return locale_periods[+(d.getUTCHours() >= 12)];
    }

    function formatUTCQuarter(d) {
      return 1 + ~~(d.getUTCMonth() / 3);
    }

    return {
      format: function(specifier) {
        var f = newFormat(specifier += "", formats);
        f.toString = function() { return specifier; };
        return f;
      },
      parse: function(specifier) {
        var p = newParse(specifier += "", false);
        p.toString = function() { return specifier; };
        return p;
      },
      utcFormat: function(specifier) {
        var f = newFormat(specifier += "", utcFormats);
        f.toString = function() { return specifier; };
        return f;
      },
      utcParse: function(specifier) {
        var p = newParse(specifier += "", true);
        p.toString = function() { return specifier; };
        return p;
      }
    };
  }

  var pads = {"-": "", "_": " ", "0": "0"},
      numberRe = /^\s*\d+/, // note: ignores next directive
      percentRe = /^%/,
      requoteRe = /[\\^$*+?|[\]().{}]/g;

  function pad(value, fill, width) {
    var sign = value < 0 ? "-" : "",
        string = (sign ? -value : value) + "",
        length = string.length;
    return sign + (length < width ? new Array(width - length + 1).join(fill) + string : string);
  }

  function requote(s) {
    return s.replace(requoteRe, "\\$&");
  }

  function formatRe(names) {
    return new RegExp("^(?:" + names.map(requote).join("|") + ")", "i");
  }

  function formatLookup(names) {
    var map = {}, i = -1, n = names.length;
    while (++i < n) map[names[i].toLowerCase()] = i;
    return map;
  }

  function parseWeekdayNumberSunday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 1));
    return n ? (d.w = +n[0], i + n[0].length) : -1;
  }

  function parseWeekdayNumberMonday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 1));
    return n ? (d.u = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberSunday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.U = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberISO(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.V = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberMonday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.W = +n[0], i + n[0].length) : -1;
  }

  function parseFullYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 4));
    return n ? (d.y = +n[0], i + n[0].length) : -1;
  }

  function parseYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.y = +n[0] + (+n[0] > 68 ? 1900 : 2000), i + n[0].length) : -1;
  }

  function parseZone(d, string, i) {
    var n = /^(Z)|([+-]\d\d)(?::?(\d\d))?/.exec(string.slice(i, i + 6));
    return n ? (d.Z = n[1] ? 0 : -(n[2] + (n[3] || "00")), i + n[0].length) : -1;
  }

  function parseQuarter(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 1));
    return n ? (d.q = n[0] * 3 - 3, i + n[0].length) : -1;
  }

  function parseMonthNumber(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.m = n[0] - 1, i + n[0].length) : -1;
  }

  function parseDayOfMonth(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.d = +n[0], i + n[0].length) : -1;
  }

  function parseDayOfYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 3));
    return n ? (d.m = 0, d.d = +n[0], i + n[0].length) : -1;
  }

  function parseHour24(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.H = +n[0], i + n[0].length) : -1;
  }

  function parseMinutes(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.M = +n[0], i + n[0].length) : -1;
  }

  function parseSeconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.S = +n[0], i + n[0].length) : -1;
  }

  function parseMilliseconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 3));
    return n ? (d.L = +n[0], i + n[0].length) : -1;
  }

  function parseMicroseconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 6));
    return n ? (d.L = Math.floor(n[0] / 1000), i + n[0].length) : -1;
  }

  function parseLiteralPercent(d, string, i) {
    var n = percentRe.exec(string.slice(i, i + 1));
    return n ? i + n[0].length : -1;
  }

  function parseUnixTimestamp(d, string, i) {
    var n = numberRe.exec(string.slice(i));
    return n ? (d.Q = +n[0], i + n[0].length) : -1;
  }

  function parseUnixTimestampSeconds(d, string, i) {
    var n = numberRe.exec(string.slice(i));
    return n ? (d.s = +n[0], i + n[0].length) : -1;
  }

  function formatDayOfMonth(d, p) {
    return pad(d.getDate(), p, 2);
  }

  function formatHour24(d, p) {
    return pad(d.getHours(), p, 2);
  }

  function formatHour12(d, p) {
    return pad(d.getHours() % 12 || 12, p, 2);
  }

  function formatDayOfYear(d, p) {
    return pad(1 + day.count(year(d), d), p, 3);
  }

  function formatMilliseconds(d, p) {
    return pad(d.getMilliseconds(), p, 3);
  }

  function formatMicroseconds(d, p) {
    return formatMilliseconds(d, p) + "000";
  }

  function formatMonthNumber(d, p) {
    return pad(d.getMonth() + 1, p, 2);
  }

  function formatMinutes(d, p) {
    return pad(d.getMinutes(), p, 2);
  }

  function formatSeconds(d, p) {
    return pad(d.getSeconds(), p, 2);
  }

  function formatWeekdayNumberMonday(d) {
    var day = d.getDay();
    return day === 0 ? 7 : day;
  }

  function formatWeekNumberSunday(d, p) {
    return pad(sunday.count(year(d) - 1, d), p, 2);
  }

  function dISO(d) {
    var day = d.getDay();
    return (day >= 4 || day === 0) ? thursday(d) : thursday.ceil(d);
  }

  function formatWeekNumberISO(d, p) {
    d = dISO(d);
    return pad(thursday.count(year(d), d) + (year(d).getDay() === 4), p, 2);
  }

  function formatWeekdayNumberSunday(d) {
    return d.getDay();
  }

  function formatWeekNumberMonday(d, p) {
    return pad(monday.count(year(d) - 1, d), p, 2);
  }

  function formatYear(d, p) {
    return pad(d.getFullYear() % 100, p, 2);
  }

  function formatYearISO(d, p) {
    d = dISO(d);
    return pad(d.getFullYear() % 100, p, 2);
  }

  function formatFullYear(d, p) {
    return pad(d.getFullYear() % 10000, p, 4);
  }

  function formatFullYearISO(d, p) {
    var day = d.getDay();
    d = (day >= 4 || day === 0) ? thursday(d) : thursday.ceil(d);
    return pad(d.getFullYear() % 10000, p, 4);
  }

  function formatZone(d) {
    var z = d.getTimezoneOffset();
    return (z > 0 ? "-" : (z *= -1, "+"))
        + pad(z / 60 | 0, "0", 2)
        + pad(z % 60, "0", 2);
  }

  function formatUTCDayOfMonth(d, p) {
    return pad(d.getUTCDate(), p, 2);
  }

  function formatUTCHour24(d, p) {
    return pad(d.getUTCHours(), p, 2);
  }

  function formatUTCHour12(d, p) {
    return pad(d.getUTCHours() % 12 || 12, p, 2);
  }

  function formatUTCDayOfYear(d, p) {
    return pad(1 + utcDay.count(utcYear(d), d), p, 3);
  }

  function formatUTCMilliseconds(d, p) {
    return pad(d.getUTCMilliseconds(), p, 3);
  }

  function formatUTCMicroseconds(d, p) {
    return formatUTCMilliseconds(d, p) + "000";
  }

  function formatUTCMonthNumber(d, p) {
    return pad(d.getUTCMonth() + 1, p, 2);
  }

  function formatUTCMinutes(d, p) {
    return pad(d.getUTCMinutes(), p, 2);
  }

  function formatUTCSeconds(d, p) {
    return pad(d.getUTCSeconds(), p, 2);
  }

  function formatUTCWeekdayNumberMonday(d) {
    var dow = d.getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  function formatUTCWeekNumberSunday(d, p) {
    return pad(utcSunday.count(utcYear(d) - 1, d), p, 2);
  }

  function UTCdISO(d) {
    var day = d.getUTCDay();
    return (day >= 4 || day === 0) ? utcThursday(d) : utcThursday.ceil(d);
  }

  function formatUTCWeekNumberISO(d, p) {
    d = UTCdISO(d);
    return pad(utcThursday.count(utcYear(d), d) + (utcYear(d).getUTCDay() === 4), p, 2);
  }

  function formatUTCWeekdayNumberSunday(d) {
    return d.getUTCDay();
  }

  function formatUTCWeekNumberMonday(d, p) {
    return pad(utcMonday.count(utcYear(d) - 1, d), p, 2);
  }

  function formatUTCYear(d, p) {
    return pad(d.getUTCFullYear() % 100, p, 2);
  }

  function formatUTCYearISO(d, p) {
    d = UTCdISO(d);
    return pad(d.getUTCFullYear() % 100, p, 2);
  }

  function formatUTCFullYear(d, p) {
    return pad(d.getUTCFullYear() % 10000, p, 4);
  }

  function formatUTCFullYearISO(d, p) {
    var day = d.getUTCDay();
    d = (day >= 4 || day === 0) ? utcThursday(d) : utcThursday.ceil(d);
    return pad(d.getUTCFullYear() % 10000, p, 4);
  }

  function formatUTCZone() {
    return "+0000";
  }

  function formatLiteralPercent() {
    return "%";
  }

  function formatUnixTimestamp(d) {
    return +d;
  }

  function formatUnixTimestampSeconds(d) {
    return Math.floor(+d / 1000);
  }

  var locale$1;
  var timeFormat;
  var timeParse;
  var utcFormat;
  var utcParse;

  defaultLocale$1({
    dateTime: "%x, %X",
    date: "%-m/%-d/%Y",
    time: "%-I:%M:%S %p",
    periods: ["AM", "PM"],
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  });

  function defaultLocale$1(definition) {
    locale$1 = formatLocale$1(definition);
    timeFormat = locale$1.format;
    timeParse = locale$1.parse;
    utcFormat = locale$1.utcFormat;
    utcParse = locale$1.utcParse;
    return locale$1;
  }

  var isoSpecifier = "%Y-%m-%dT%H:%M:%S.%LZ";

  function formatIsoNative(date) {
    return date.toISOString();
  }

  var formatIso = Date.prototype.toISOString
      ? formatIsoNative
      : utcFormat(isoSpecifier);

  function parseIsoNative(string) {
    var date = new Date(string);
    return isNaN(date) ? null : date;
  }

  var parseIso = +new Date("2000-01-01T00:00:00.000Z")
      ? parseIsoNative
      : utcParse(isoSpecifier);

  function colors(s) {
    return s.match(/.{6}/g).map(function(x) {
      return "#" + x;
    });
  }

  colors("1f77b4ff7f0e2ca02cd627289467bd8c564be377c27f7f7fbcbd2217becf");

  colors("393b795254a36b6ecf9c9ede6379398ca252b5cf6bcedb9c8c6d31bd9e39e7ba52e7cb94843c39ad494ad6616be7969c7b4173a55194ce6dbdde9ed6");

  colors("3182bd6baed69ecae1c6dbefe6550dfd8d3cfdae6bfdd0a231a35474c476a1d99bc7e9c0756bb19e9ac8bcbddcdadaeb636363969696bdbdbdd9d9d9");

  var category20 = colors("1f77b4aec7e8ff7f0effbb782ca02c98df8ad62728ff98969467bdc5b0d58c564bc49c94e377c2f7b6d27f7f7fc7c7c7bcbd22dbdb8d17becf9edae5");

  cubehelixLong(cubehelix(300, 0.5, 0.0), cubehelix(-240, 0.5, 1.0));

  var warm = cubehelixLong(cubehelix(-100, 0.75, 0.35), cubehelix(80, 1.50, 0.8));

  var cool = cubehelixLong(cubehelix(260, 0.75, 0.35), cubehelix(80, 1.50, 0.8));

  var rainbow = cubehelix();

  function ramp(range) {
    var n = range.length;
    return function(t) {
      return range[Math.max(0, Math.min(n - 1, Math.floor(t * n)))];
    };
  }

  ramp(colors("44015444025645045745055946075a46085c460a5d460b5e470d60470e6147106347116447136548146748166848176948186a481a6c481b6d481c6e481d6f481f70482071482173482374482475482576482677482878482979472a7a472c7a472d7b472e7c472f7d46307e46327e46337f463480453581453781453882443983443a83443b84433d84433e85423f854240864241864142874144874045884046883f47883f48893e49893e4a893e4c8a3d4d8a3d4e8a3c4f8a3c508b3b518b3b528b3a538b3a548c39558c39568c38588c38598c375a8c375b8d365c8d365d8d355e8d355f8d34608d34618d33628d33638d32648e32658e31668e31678e31688e30698e306a8e2f6b8e2f6c8e2e6d8e2e6e8e2e6f8e2d708e2d718e2c718e2c728e2c738e2b748e2b758e2a768e2a778e2a788e29798e297a8e297b8e287c8e287d8e277e8e277f8e27808e26818e26828e26828e25838e25848e25858e24868e24878e23888e23898e238a8d228b8d228c8d228d8d218e8d218f8d21908d21918c20928c20928c20938c1f948c1f958b1f968b1f978b1f988b1f998a1f9a8a1e9b8a1e9c891e9d891f9e891f9f881fa0881fa1881fa1871fa28720a38620a48621a58521a68522a78522a88423a98324aa8325ab8225ac8226ad8127ad8128ae8029af7f2ab07f2cb17e2db27d2eb37c2fb47c31b57b32b67a34b67935b77937b87838b9773aba763bbb753dbc743fbc7340bd7242be7144bf7046c06f48c16e4ac16d4cc26c4ec36b50c46a52c56954c56856c66758c7655ac8645cc8635ec96260ca6063cb5f65cb5e67cc5c69cd5b6ccd5a6ece5870cf5773d05675d05477d1537ad1517cd2507fd34e81d34d84d44b86d54989d5488bd6468ed64590d74393d74195d84098d83e9bd93c9dd93ba0da39a2da37a5db36a8db34aadc32addc30b0dd2fb2dd2db5de2bb8de29bade28bddf26c0df25c2df23c5e021c8e020cae11fcde11dd0e11cd2e21bd5e21ad8e219dae319dde318dfe318e2e418e5e419e7e419eae51aece51befe51cf1e51df4e61ef6e620f8e621fbe723fde725"));

  var magma = ramp(colors("00000401000501010601010802010902020b02020d03030f03031204041405041606051806051a07061c08071e0907200a08220b09240c09260d0a290e0b2b100b2d110c2f120d31130d34140e36150e38160f3b180f3d19103f1a10421c10441d11471e114920114b21114e22115024125325125527125829115a2a115c2c115f2d11612f116331116533106734106936106b38106c390f6e3b0f703d0f713f0f72400f74420f75440f764510774710784910784a10794c117a4e117b4f127b51127c52137c54137d56147d57157e59157e5a167e5c167f5d177f5f187f601880621980641a80651a80671b80681c816a1c816b1d816d1d816e1e81701f81721f817320817521817621817822817922827b23827c23827e24828025828125818326818426818627818827818928818b29818c29818e2a81902a81912b81932b80942c80962c80982d80992d809b2e7f9c2e7f9e2f7fa02f7fa1307ea3307ea5317ea6317da8327daa337dab337cad347cae347bb0357bb2357bb3367ab5367ab73779b83779ba3878bc3978bd3977bf3a77c03a76c23b75c43c75c53c74c73d73c83e73ca3e72cc3f71cd4071cf4070d0416fd2426fd3436ed5446dd6456cd8456cd9466bdb476adc4869de4968df4a68e04c67e24d66e34e65e44f64e55064e75263e85362e95462ea5661eb5760ec5860ed5a5fee5b5eef5d5ef05f5ef1605df2625df2645cf3655cf4675cf4695cf56b5cf66c5cf66e5cf7705cf7725cf8745cf8765cf9785df9795df97b5dfa7d5efa7f5efa815ffb835ffb8560fb8761fc8961fc8a62fc8c63fc8e64fc9065fd9266fd9467fd9668fd9869fd9a6afd9b6bfe9d6cfe9f6dfea16efea36ffea571fea772fea973feaa74feac76feae77feb078feb27afeb47bfeb67cfeb77efeb97ffebb81febd82febf84fec185fec287fec488fec68afec88cfeca8dfecc8ffecd90fecf92fed194fed395fed597fed799fed89afdda9cfddc9efddea0fde0a1fde2a3fde3a5fde5a7fde7a9fde9aafdebacfcecaefceeb0fcf0b2fcf2b4fcf4b6fcf6b8fcf7b9fcf9bbfcfbbdfcfdbf"));

  var inferno = ramp(colors("00000401000501010601010802010a02020c02020e03021004031204031405041706041907051b08051d09061f0a07220b07240c08260d08290e092b10092d110a30120a32140b34150b37160b39180c3c190c3e1b0c411c0c431e0c451f0c48210c4a230c4c240c4f260c51280b53290b552b0b572d0b592f0a5b310a5c320a5e340a5f3609613809623909633b09643d09653e0966400a67420a68440a68450a69470b6a490b6a4a0c6b4c0c6b4d0d6c4f0d6c510e6c520e6d540f6d550f6d57106e59106e5a116e5c126e5d126e5f136e61136e62146e64156e65156e67166e69166e6a176e6c186e6d186e6f196e71196e721a6e741a6e751b6e771c6d781c6d7a1d6d7c1d6d7d1e6d7f1e6c801f6c82206c84206b85216b87216b88226a8a226a8c23698d23698f24699025689225689326679526679727669827669a28659b29649d29649f2a63a02a63a22b62a32c61a52c60a62d60a82e5fa92e5eab2f5ead305dae305cb0315bb1325ab3325ab43359b63458b73557b93556ba3655bc3754bd3853bf3952c03a51c13a50c33b4fc43c4ec63d4dc73e4cc83f4bca404acb4149cc4248ce4347cf4446d04545d24644d34743d44842d54a41d74b3fd84c3ed94d3dda4e3cdb503bdd513ade5238df5337e05536e15635e25734e35933e45a31e55c30e65d2fe75e2ee8602de9612bea632aeb6429eb6628ec6726ed6925ee6a24ef6c23ef6e21f06f20f1711ff1731df2741cf3761bf37819f47918f57b17f57d15f67e14f68013f78212f78410f8850ff8870ef8890cf98b0bf98c0af98e09fa9008fa9207fa9407fb9606fb9706fb9906fb9b06fb9d07fc9f07fca108fca309fca50afca60cfca80dfcaa0ffcac11fcae12fcb014fcb216fcb418fbb61afbb81dfbba1ffbbc21fbbe23fac026fac228fac42afac62df9c72ff9c932f9cb35f8cd37f8cf3af7d13df7d340f6d543f6d746f5d949f5db4cf4dd4ff4df53f4e156f3e35af3e55df2e661f2e865f2ea69f1ec6df1ed71f1ef75f1f179f2f27df2f482f3f586f3f68af4f88ef5f992f6fa96f8fb9af9fc9dfafda1fcffa4"));

  var plasma = ramp(colors("0d088710078813078916078a19068c1b068d1d068e20068f2206902406912605912805922a05932c05942e05952f059631059733059735049837049938049a3a049a3c049b3e049c3f049c41049d43039e44039e46039f48039f4903a04b03a14c02a14e02a25002a25102a35302a35502a45601a45801a45901a55b01a55c01a65e01a66001a66100a76300a76400a76600a76700a86900a86a00a86c00a86e00a86f00a87100a87201a87401a87501a87701a87801a87a02a87b02a87d03a87e03a88004a88104a78305a78405a78606a68707a68808a68a09a58b0aa58d0ba58e0ca48f0da4910ea3920fa39410a29511a19613a19814a099159f9a169f9c179e9d189d9e199da01a9ca11b9ba21d9aa31e9aa51f99a62098a72197a82296aa2395ab2494ac2694ad2793ae2892b02991b12a90b22b8fb32c8eb42e8db52f8cb6308bb7318ab83289ba3388bb3488bc3587bd3786be3885bf3984c03a83c13b82c23c81c33d80c43e7fc5407ec6417dc7427cc8437bc9447aca457acb4679cc4778cc4977cd4a76ce4b75cf4c74d04d73d14e72d24f71d35171d45270d5536fd5546ed6556dd7566cd8576bd9586ada5a6ada5b69db5c68dc5d67dd5e66de5f65de6164df6263e06363e16462e26561e26660e3685fe4695ee56a5de56b5de66c5ce76e5be76f5ae87059e97158e97257ea7457eb7556eb7655ec7754ed7953ed7a52ee7b51ef7c51ef7e50f07f4ff0804ef1814df1834cf2844bf3854bf3874af48849f48948f58b47f58c46f68d45f68f44f79044f79143f79342f89441f89540f9973ff9983ef99a3efa9b3dfa9c3cfa9e3bfb9f3afba139fba238fca338fca537fca636fca835fca934fdab33fdac33fdae32fdaf31fdb130fdb22ffdb42ffdb52efeb72dfeb82cfeba2cfebb2bfebd2afebe2afec029fdc229fdc328fdc527fdc627fdc827fdca26fdcb26fccd25fcce25fcd025fcd225fbd324fbd524fbd724fad824fada24f9dc24f9dd25f8df25f8e125f7e225f7e425f6e626f6e826f5e926f5eb27f4ed27f3ee27f3f027f2f227f1f426f1f525f0f724f0f921"));

  var slice$1 = Array.prototype.slice;

  function identity$2(x) {
    return x;
  }

  var top = 1,
      right = 2,
      bottom = 3,
      left = 4,
      epsilon = 1e-6;

  function translateX(x) {
    return "translate(" + (x + 0.5) + ",0)";
  }

  function translateY(y) {
    return "translate(0," + (y + 0.5) + ")";
  }

  function number$1(scale) {
    return function(d) {
      return +scale(d);
    };
  }

  function center(scale) {
    var offset = Math.max(0, scale.bandwidth() - 1) / 2; // Adjust for 0.5px offset.
    if (scale.round()) offset = Math.round(offset);
    return function(d) {
      return +scale(d) + offset;
    };
  }

  function entering() {
    return !this.__axis;
  }

  function axis(orient, scale) {
    var tickArguments = [],
        tickValues = null,
        tickFormat = null,
        tickSizeInner = 6,
        tickSizeOuter = 6,
        tickPadding = 3,
        k = orient === top || orient === left ? -1 : 1,
        x = orient === left || orient === right ? "x" : "y",
        transform = orient === top || orient === bottom ? translateX : translateY;

    function axis(context) {
      var values = tickValues == null ? (scale.ticks ? scale.ticks.apply(scale, tickArguments) : scale.domain()) : tickValues,
          format = tickFormat == null ? (scale.tickFormat ? scale.tickFormat.apply(scale, tickArguments) : identity$2) : tickFormat,
          spacing = Math.max(tickSizeInner, 0) + tickPadding,
          range = scale.range(),
          range0 = +range[0] + 0.5,
          range1 = +range[range.length - 1] + 0.5,
          position = (scale.bandwidth ? center : number$1)(scale.copy()),
          selection = context.selection ? context.selection() : context,
          path = selection.selectAll(".domain").data([null]),
          tick = selection.selectAll(".tick").data(values, scale).order(),
          tickExit = tick.exit(),
          tickEnter = tick.enter().append("g").attr("class", "tick"),
          line = tick.select("line"),
          text = tick.select("text");

      path = path.merge(path.enter().insert("path", ".tick")
          .attr("class", "domain")
          .attr("stroke", "currentColor"));

      tick = tick.merge(tickEnter);

      line = line.merge(tickEnter.append("line")
          .attr("stroke", "currentColor")
          .attr(x + "2", k * tickSizeInner));

      text = text.merge(tickEnter.append("text")
          .attr("fill", "currentColor")
          .attr(x, k * spacing)
          .attr("dy", orient === top ? "0em" : orient === bottom ? "0.71em" : "0.32em"));

      if (context !== selection) {
        path = path.transition(context);
        tick = tick.transition(context);
        line = line.transition(context);
        text = text.transition(context);

        tickExit = tickExit.transition(context)
            .attr("opacity", epsilon)
            .attr("transform", function(d) { return isFinite(d = position(d)) ? transform(d) : this.getAttribute("transform"); });

        tickEnter
            .attr("opacity", epsilon)
            .attr("transform", function(d) { var p = this.parentNode.__axis; return transform(p && isFinite(p = p(d)) ? p : position(d)); });
      }

      tickExit.remove();

      path
          .attr("d", orient === left || orient == right
              ? (tickSizeOuter ? "M" + k * tickSizeOuter + "," + range0 + "H0.5V" + range1 + "H" + k * tickSizeOuter : "M0.5," + range0 + "V" + range1)
              : (tickSizeOuter ? "M" + range0 + "," + k * tickSizeOuter + "V0.5H" + range1 + "V" + k * tickSizeOuter : "M" + range0 + ",0.5H" + range1));

      tick
          .attr("opacity", 1)
          .attr("transform", function(d) { return transform(position(d)); });

      line
          .attr(x + "2", k * tickSizeInner);

      text
          .attr(x, k * spacing)
          .text(format);

      selection.filter(entering)
          .attr("fill", "none")
          .attr("font-size", 10)
          .attr("font-family", "sans-serif")
          .attr("text-anchor", orient === right ? "start" : orient === left ? "end" : "middle");

      selection
          .each(function() { this.__axis = position; });
    }

    axis.scale = function(_) {
      return arguments.length ? (scale = _, axis) : scale;
    };

    axis.ticks = function() {
      return tickArguments = slice$1.call(arguments), axis;
    };

    axis.tickArguments = function(_) {
      return arguments.length ? (tickArguments = _ == null ? [] : slice$1.call(_), axis) : tickArguments.slice();
    };

    axis.tickValues = function(_) {
      return arguments.length ? (tickValues = _ == null ? null : slice$1.call(_), axis) : tickValues && tickValues.slice();
    };

    axis.tickFormat = function(_) {
      return arguments.length ? (tickFormat = _, axis) : tickFormat;
    };

    axis.tickSize = function(_) {
      return arguments.length ? (tickSizeInner = tickSizeOuter = +_, axis) : tickSizeInner;
    };

    axis.tickSizeInner = function(_) {
      return arguments.length ? (tickSizeInner = +_, axis) : tickSizeInner;
    };

    axis.tickSizeOuter = function(_) {
      return arguments.length ? (tickSizeOuter = +_, axis) : tickSizeOuter;
    };

    axis.tickPadding = function(_) {
      return arguments.length ? (tickPadding = +_, axis) : tickPadding;
    };

    return axis;
  }

  function axisBottom(scale) {
    return axis(bottom, scale);
  }

  function axisLeft(scale) {
    return axis(left, scale);
  }

  var noop = {value: function() {}};

  function dispatch() {
    for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
      if (!(t = arguments[i] + "") || (t in _) || /[\s.]/.test(t)) throw new Error("illegal type: " + t);
      _[t] = [];
    }
    return new Dispatch(_);
  }

  function Dispatch(_) {
    this._ = _;
  }

  function parseTypenames$1(typenames, types) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
      if (t && !types.hasOwnProperty(t)) throw new Error("unknown type: " + t);
      return {type: t, name: name};
    });
  }

  Dispatch.prototype = dispatch.prototype = {
    constructor: Dispatch,
    on: function(typename, callback) {
      var _ = this._,
          T = parseTypenames$1(typename + "", _),
          t,
          i = -1,
          n = T.length;

      // If no callback was specified, return the callback of the given type and name.
      if (arguments.length < 2) {
        while (++i < n) if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name))) return t;
        return;
      }

      // If a type was specified, set the callback for the given type and name.
      // Otherwise, if a null callback was specified, remove callbacks of the given name.
      if (callback != null && typeof callback !== "function") throw new Error("invalid callback: " + callback);
      while (++i < n) {
        if (t = (typename = T[i]).type) _[t] = set$1(_[t], typename.name, callback);
        else if (callback == null) for (t in _) _[t] = set$1(_[t], typename.name, null);
      }

      return this;
    },
    copy: function() {
      var copy = {}, _ = this._;
      for (var t in _) copy[t] = _[t].slice();
      return new Dispatch(copy);
    },
    call: function(type, that) {
      if ((n = arguments.length - 2) > 0) for (var args = new Array(n), i = 0, n, t; i < n; ++i) args[i] = arguments[i + 2];
      if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
      for (t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
    },
    apply: function(type, that, args) {
      if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
      for (var t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
    }
  };

  function get(type, name) {
    for (var i = 0, n = type.length, c; i < n; ++i) {
      if ((c = type[i]).name === name) {
        return c.value;
      }
    }
  }

  function set$1(type, name, callback) {
    for (var i = 0, n = type.length; i < n; ++i) {
      if (type[i].name === name) {
        type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
        break;
      }
    }
    if (callback != null) type.push({name: name, value: callback});
    return type;
  }

  var frame = 0, // is an animation frame pending?
      timeout = 0, // is a timeout pending?
      interval = 0, // are any timers active?
      pokeDelay = 1000, // how frequently we check for clock skew
      taskHead,
      taskTail,
      clockLast = 0,
      clockNow = 0,
      clockSkew = 0,
      clock = typeof performance === "object" && performance.now ? performance : Date,
      setFrame = typeof window === "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) { setTimeout(f, 17); };

  function now() {
    return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
  }

  function clearNow() {
    clockNow = 0;
  }

  function Timer() {
    this._call =
    this._time =
    this._next = null;
  }

  Timer.prototype = timer.prototype = {
    constructor: Timer,
    restart: function(callback, delay, time) {
      if (typeof callback !== "function") throw new TypeError("callback is not a function");
      time = (time == null ? now() : +time) + (delay == null ? 0 : +delay);
      if (!this._next && taskTail !== this) {
        if (taskTail) taskTail._next = this;
        else taskHead = this;
        taskTail = this;
      }
      this._call = callback;
      this._time = time;
      sleep();
    },
    stop: function() {
      if (this._call) {
        this._call = null;
        this._time = Infinity;
        sleep();
      }
    }
  };

  function timer(callback, delay, time) {
    var t = new Timer;
    t.restart(callback, delay, time);
    return t;
  }

  function timerFlush() {
    now(); // Get the current time, if not already set.
    ++frame; // Pretend we’ve set an alarm, if we haven’t already.
    var t = taskHead, e;
    while (t) {
      if ((e = clockNow - t._time) >= 0) t._call.call(null, e);
      t = t._next;
    }
    --frame;
  }

  function wake() {
    clockNow = (clockLast = clock.now()) + clockSkew;
    frame = timeout = 0;
    try {
      timerFlush();
    } finally {
      frame = 0;
      nap();
      clockNow = 0;
    }
  }

  function poke() {
    var now = clock.now(), delay = now - clockLast;
    if (delay > pokeDelay) clockSkew -= delay, clockLast = now;
  }

  function nap() {
    var t0, t1 = taskHead, t2, time = Infinity;
    while (t1) {
      if (t1._call) {
        if (time > t1._time) time = t1._time;
        t0 = t1, t1 = t1._next;
      } else {
        t2 = t1._next, t1._next = null;
        t1 = t0 ? t0._next = t2 : taskHead = t2;
      }
    }
    taskTail = t0;
    sleep(time);
  }

  function sleep(time) {
    if (frame) return; // Soonest alarm already set, or will be.
    if (timeout) timeout = clearTimeout(timeout);
    var delay = time - clockNow; // Strictly less than if we recomputed clockNow.
    if (delay > 24) {
      if (time < Infinity) timeout = setTimeout(wake, time - clock.now() - clockSkew);
      if (interval) interval = clearInterval(interval);
    } else {
      if (!interval) clockLast = clock.now(), interval = setInterval(poke, pokeDelay);
      frame = 1, setFrame(wake);
    }
  }

  function timeout$1(callback, delay, time) {
    var t = new Timer;
    delay = delay == null ? 0 : +delay;
    t.restart(function(elapsed) {
      t.stop();
      callback(elapsed + delay);
    }, delay, time);
    return t;
  }

  var emptyOn = dispatch("start", "end", "cancel", "interrupt");
  var emptyTween = [];

  var CREATED = 0;
  var SCHEDULED = 1;
  var STARTING = 2;
  var STARTED = 3;
  var RUNNING = 4;
  var ENDING = 5;
  var ENDED = 6;

  function schedule(node, name, id, index, group, timing) {
    var schedules = node.__transition;
    if (!schedules) node.__transition = {};
    else if (id in schedules) return;
    create(node, id, {
      name: name,
      index: index, // For context during callback.
      group: group, // For context during callback.
      on: emptyOn,
      tween: emptyTween,
      time: timing.time,
      delay: timing.delay,
      duration: timing.duration,
      ease: timing.ease,
      timer: null,
      state: CREATED
    });
  }

  function init(node, id) {
    var schedule = get$1(node, id);
    if (schedule.state > CREATED) throw new Error("too late; already scheduled");
    return schedule;
  }

  function set$2(node, id) {
    var schedule = get$1(node, id);
    if (schedule.state > STARTED) throw new Error("too late; already running");
    return schedule;
  }

  function get$1(node, id) {
    var schedule = node.__transition;
    if (!schedule || !(schedule = schedule[id])) throw new Error("transition not found");
    return schedule;
  }

  function create(node, id, self) {
    var schedules = node.__transition,
        tween;

    // Initialize the self timer when the transition is created.
    // Note the actual delay is not known until the first callback!
    schedules[id] = self;
    self.timer = timer(schedule, 0, self.time);

    function schedule(elapsed) {
      self.state = SCHEDULED;
      self.timer.restart(start, self.delay, self.time);

      // If the elapsed delay is less than our first sleep, start immediately.
      if (self.delay <= elapsed) start(elapsed - self.delay);
    }

    function start(elapsed) {
      var i, j, n, o;

      // If the state is not SCHEDULED, then we previously errored on start.
      if (self.state !== SCHEDULED) return stop();

      for (i in schedules) {
        o = schedules[i];
        if (o.name !== self.name) continue;

        // While this element already has a starting transition during this frame,
        // defer starting an interrupting transition until that transition has a
        // chance to tick (and possibly end); see d3/d3-transition#54!
        if (o.state === STARTED) return timeout$1(start);

        // Interrupt the active transition, if any.
        if (o.state === RUNNING) {
          o.state = ENDED;
          o.timer.stop();
          o.on.call("interrupt", node, node.__data__, o.index, o.group);
          delete schedules[i];
        }

        // Cancel any pre-empted transitions.
        else if (+i < id) {
          o.state = ENDED;
          o.timer.stop();
          o.on.call("cancel", node, node.__data__, o.index, o.group);
          delete schedules[i];
        }
      }

      // Defer the first tick to end of the current frame; see d3/d3#1576.
      // Note the transition may be canceled after start and before the first tick!
      // Note this must be scheduled before the start event; see d3/d3-transition#16!
      // Assuming this is successful, subsequent callbacks go straight to tick.
      timeout$1(function() {
        if (self.state === STARTED) {
          self.state = RUNNING;
          self.timer.restart(tick, self.delay, self.time);
          tick(elapsed);
        }
      });

      // Dispatch the start event.
      // Note this must be done before the tween are initialized.
      self.state = STARTING;
      self.on.call("start", node, node.__data__, self.index, self.group);
      if (self.state !== STARTING) return; // interrupted
      self.state = STARTED;

      // Initialize the tween, deleting null tween.
      tween = new Array(n = self.tween.length);
      for (i = 0, j = -1; i < n; ++i) {
        if (o = self.tween[i].value.call(node, node.__data__, self.index, self.group)) {
          tween[++j] = o;
        }
      }
      tween.length = j + 1;
    }

    function tick(elapsed) {
      var t = elapsed < self.duration ? self.ease.call(null, elapsed / self.duration) : (self.timer.restart(stop), self.state = ENDING, 1),
          i = -1,
          n = tween.length;

      while (++i < n) {
        tween[i].call(node, t);
      }

      // Dispatch the end event.
      if (self.state === ENDING) {
        self.on.call("end", node, node.__data__, self.index, self.group);
        stop();
      }
    }

    function stop() {
      self.state = ENDED;
      self.timer.stop();
      delete schedules[id];
      for (var i in schedules) return; // eslint-disable-line no-unused-vars
      delete node.__transition;
    }
  }

  function interrupt(node, name) {
    var schedules = node.__transition,
        schedule,
        active,
        empty = true,
        i;

    if (!schedules) return;

    name = name == null ? null : name + "";

    for (i in schedules) {
      if ((schedule = schedules[i]).name !== name) { empty = false; continue; }
      active = schedule.state > STARTING && schedule.state < ENDING;
      schedule.state = ENDED;
      schedule.timer.stop();
      schedule.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule.index, schedule.group);
      delete schedules[i];
    }

    if (empty) delete node.__transition;
  }

  function selection_interrupt(name) {
    return this.each(function() {
      interrupt(this, name);
    });
  }

  function tweenRemove(id, name) {
    var tween0, tween1;
    return function() {
      var schedule = set$2(this, id),
          tween = schedule.tween;

      // If this node shared tween with the previous node,
      // just assign the updated shared tween and we’re done!
      // Otherwise, copy-on-write.
      if (tween !== tween0) {
        tween1 = tween0 = tween;
        for (var i = 0, n = tween1.length; i < n; ++i) {
          if (tween1[i].name === name) {
            tween1 = tween1.slice();
            tween1.splice(i, 1);
            break;
          }
        }
      }

      schedule.tween = tween1;
    };
  }

  function tweenFunction(id, name, value) {
    var tween0, tween1;
    if (typeof value !== "function") throw new Error;
    return function() {
      var schedule = set$2(this, id),
          tween = schedule.tween;

      // If this node shared tween with the previous node,
      // just assign the updated shared tween and we’re done!
      // Otherwise, copy-on-write.
      if (tween !== tween0) {
        tween1 = (tween0 = tween).slice();
        for (var t = {name: name, value: value}, i = 0, n = tween1.length; i < n; ++i) {
          if (tween1[i].name === name) {
            tween1[i] = t;
            break;
          }
        }
        if (i === n) tween1.push(t);
      }

      schedule.tween = tween1;
    };
  }

  function transition_tween(name, value) {
    var id = this._id;

    name += "";

    if (arguments.length < 2) {
      var tween = get$1(this.node(), id).tween;
      for (var i = 0, n = tween.length, t; i < n; ++i) {
        if ((t = tween[i]).name === name) {
          return t.value;
        }
      }
      return null;
    }

    return this.each((value == null ? tweenRemove : tweenFunction)(id, name, value));
  }

  function tweenValue(transition, name, value) {
    var id = transition._id;

    transition.each(function() {
      var schedule = set$2(this, id);
      (schedule.value || (schedule.value = {}))[name] = value.apply(this, arguments);
    });

    return function(node) {
      return get$1(node, id).value[name];
    };
  }

  function interpolate(a, b) {
    var c;
    return (typeof b === "number" ? interpolateNumber
        : b instanceof color ? interpolateRgb
        : (c = color(b)) ? (b = c, interpolateRgb)
        : interpolateString)(a, b);
  }

  function attrRemove$1(name) {
    return function() {
      this.removeAttribute(name);
    };
  }

  function attrRemoveNS$1(fullname) {
    return function() {
      this.removeAttributeNS(fullname.space, fullname.local);
    };
  }

  function attrConstant$1(name, interpolate, value1) {
    var string00,
        string1 = value1 + "",
        interpolate0;
    return function() {
      var string0 = this.getAttribute(name);
      return string0 === string1 ? null
          : string0 === string00 ? interpolate0
          : interpolate0 = interpolate(string00 = string0, value1);
    };
  }

  function attrConstantNS$1(fullname, interpolate, value1) {
    var string00,
        string1 = value1 + "",
        interpolate0;
    return function() {
      var string0 = this.getAttributeNS(fullname.space, fullname.local);
      return string0 === string1 ? null
          : string0 === string00 ? interpolate0
          : interpolate0 = interpolate(string00 = string0, value1);
    };
  }

  function attrFunction$1(name, interpolate, value) {
    var string00,
        string10,
        interpolate0;
    return function() {
      var string0, value1 = value(this), string1;
      if (value1 == null) return void this.removeAttribute(name);
      string0 = this.getAttribute(name);
      string1 = value1 + "";
      return string0 === string1 ? null
          : string0 === string00 && string1 === string10 ? interpolate0
          : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
    };
  }

  function attrFunctionNS$1(fullname, interpolate, value) {
    var string00,
        string10,
        interpolate0;
    return function() {
      var string0, value1 = value(this), string1;
      if (value1 == null) return void this.removeAttributeNS(fullname.space, fullname.local);
      string0 = this.getAttributeNS(fullname.space, fullname.local);
      string1 = value1 + "";
      return string0 === string1 ? null
          : string0 === string00 && string1 === string10 ? interpolate0
          : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
    };
  }

  function transition_attr(name, value) {
    var fullname = namespace(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate;
    return this.attrTween(name, typeof value === "function"
        ? (fullname.local ? attrFunctionNS$1 : attrFunction$1)(fullname, i, tweenValue(this, "attr." + name, value))
        : value == null ? (fullname.local ? attrRemoveNS$1 : attrRemove$1)(fullname)
        : (fullname.local ? attrConstantNS$1 : attrConstant$1)(fullname, i, value));
  }

  function attrInterpolate(name, i) {
    return function(t) {
      this.setAttribute(name, i.call(this, t));
    };
  }

  function attrInterpolateNS(fullname, i) {
    return function(t) {
      this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
    };
  }

  function attrTweenNS(fullname, value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0) t0 = (i0 = i) && attrInterpolateNS(fullname, i);
      return t0;
    }
    tween._value = value;
    return tween;
  }

  function attrTween(name, value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0) t0 = (i0 = i) && attrInterpolate(name, i);
      return t0;
    }
    tween._value = value;
    return tween;
  }

  function transition_attrTween(name, value) {
    var key = "attr." + name;
    if (arguments.length < 2) return (key = this.tween(key)) && key._value;
    if (value == null) return this.tween(key, null);
    if (typeof value !== "function") throw new Error;
    var fullname = namespace(name);
    return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value));
  }

  function delayFunction(id, value) {
    return function() {
      init(this, id).delay = +value.apply(this, arguments);
    };
  }

  function delayConstant(id, value) {
    return value = +value, function() {
      init(this, id).delay = value;
    };
  }

  function transition_delay(value) {
    var id = this._id;

    return arguments.length
        ? this.each((typeof value === "function"
            ? delayFunction
            : delayConstant)(id, value))
        : get$1(this.node(), id).delay;
  }

  function durationFunction(id, value) {
    return function() {
      set$2(this, id).duration = +value.apply(this, arguments);
    };
  }

  function durationConstant(id, value) {
    return value = +value, function() {
      set$2(this, id).duration = value;
    };
  }

  function transition_duration(value) {
    var id = this._id;

    return arguments.length
        ? this.each((typeof value === "function"
            ? durationFunction
            : durationConstant)(id, value))
        : get$1(this.node(), id).duration;
  }

  function easeConstant(id, value) {
    if (typeof value !== "function") throw new Error;
    return function() {
      set$2(this, id).ease = value;
    };
  }

  function transition_ease(value) {
    var id = this._id;

    return arguments.length
        ? this.each(easeConstant(id, value))
        : get$1(this.node(), id).ease;
  }

  function transition_filter(match) {
    if (typeof match !== "function") match = matcher(match);

    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
        if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
          subgroup.push(node);
        }
      }
    }

    return new Transition(subgroups, this._parents, this._name, this._id);
  }

  function transition_merge(transition) {
    if (transition._id !== this._id) throw new Error;

    for (var groups0 = this._groups, groups1 = transition._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
      for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group0[i] || group1[i]) {
          merge[i] = node;
        }
      }
    }

    for (; j < m0; ++j) {
      merges[j] = groups0[j];
    }

    return new Transition(merges, this._parents, this._name, this._id);
  }

  function start(name) {
    return (name + "").trim().split(/^|\s+/).every(function(t) {
      var i = t.indexOf(".");
      if (i >= 0) t = t.slice(0, i);
      return !t || t === "start";
    });
  }

  function onFunction(id, name, listener) {
    var on0, on1, sit = start(name) ? init : set$2;
    return function() {
      var schedule = sit(this, id),
          on = schedule.on;

      // If this node shared a dispatch with the previous node,
      // just assign the updated shared dispatch and we’re done!
      // Otherwise, copy-on-write.
      if (on !== on0) (on1 = (on0 = on).copy()).on(name, listener);

      schedule.on = on1;
    };
  }

  function transition_on(name, listener) {
    var id = this._id;

    return arguments.length < 2
        ? get$1(this.node(), id).on.on(name)
        : this.each(onFunction(id, name, listener));
  }

  function removeFunction(id) {
    return function() {
      var parent = this.parentNode;
      for (var i in this.__transition) if (+i !== id) return;
      if (parent) parent.removeChild(this);
    };
  }

  function transition_remove() {
    return this.on("end.remove", removeFunction(this._id));
  }

  function transition_select(select) {
    var name = this._name,
        id = this._id;

    if (typeof select !== "function") select = selector(select);

    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
        if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
          if ("__data__" in node) subnode.__data__ = node.__data__;
          subgroup[i] = subnode;
          schedule(subgroup[i], name, id, i, subgroup, get$1(node, id));
        }
      }
    }

    return new Transition(subgroups, this._parents, name, id);
  }

  function transition_selectAll(select) {
    var name = this._name,
        id = this._id;

    if (typeof select !== "function") select = selectorAll(select);

    for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          for (var children = select.call(node, node.__data__, i, group), child, inherit = get$1(node, id), k = 0, l = children.length; k < l; ++k) {
            if (child = children[k]) {
              schedule(child, name, id, k, children, inherit);
            }
          }
          subgroups.push(children);
          parents.push(node);
        }
      }
    }

    return new Transition(subgroups, parents, name, id);
  }

  var Selection$1 = selection.prototype.constructor;

  function transition_selection() {
    return new Selection$1(this._groups, this._parents);
  }

  function styleNull(name, interpolate) {
    var string00,
        string10,
        interpolate0;
    return function() {
      var string0 = styleValue(this, name),
          string1 = (this.style.removeProperty(name), styleValue(this, name));
      return string0 === string1 ? null
          : string0 === string00 && string1 === string10 ? interpolate0
          : interpolate0 = interpolate(string00 = string0, string10 = string1);
    };
  }

  function styleRemove$1(name) {
    return function() {
      this.style.removeProperty(name);
    };
  }

  function styleConstant$1(name, interpolate, value1) {
    var string00,
        string1 = value1 + "",
        interpolate0;
    return function() {
      var string0 = styleValue(this, name);
      return string0 === string1 ? null
          : string0 === string00 ? interpolate0
          : interpolate0 = interpolate(string00 = string0, value1);
    };
  }

  function styleFunction$1(name, interpolate, value) {
    var string00,
        string10,
        interpolate0;
    return function() {
      var string0 = styleValue(this, name),
          value1 = value(this),
          string1 = value1 + "";
      if (value1 == null) string1 = value1 = (this.style.removeProperty(name), styleValue(this, name));
      return string0 === string1 ? null
          : string0 === string00 && string1 === string10 ? interpolate0
          : (string10 = string1, interpolate0 = interpolate(string00 = string0, value1));
    };
  }

  function styleMaybeRemove(id, name) {
    var on0, on1, listener0, key = "style." + name, event = "end." + key, remove;
    return function() {
      var schedule = set$2(this, id),
          on = schedule.on,
          listener = schedule.value[key] == null ? remove || (remove = styleRemove$1(name)) : undefined;

      // If this node shared a dispatch with the previous node,
      // just assign the updated shared dispatch and we’re done!
      // Otherwise, copy-on-write.
      if (on !== on0 || listener0 !== listener) (on1 = (on0 = on).copy()).on(event, listener0 = listener);

      schedule.on = on1;
    };
  }

  function transition_style(name, value, priority) {
    var i = (name += "") === "transform" ? interpolateTransformCss : interpolate;
    return value == null ? this
        .styleTween(name, styleNull(name, i))
        .on("end.style." + name, styleRemove$1(name))
      : typeof value === "function" ? this
        .styleTween(name, styleFunction$1(name, i, tweenValue(this, "style." + name, value)))
        .each(styleMaybeRemove(this._id, name))
      : this
        .styleTween(name, styleConstant$1(name, i, value), priority)
        .on("end.style." + name, null);
  }

  function styleInterpolate(name, i, priority) {
    return function(t) {
      this.style.setProperty(name, i.call(this, t), priority);
    };
  }

  function styleTween(name, value, priority) {
    var t, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0) t = (i0 = i) && styleInterpolate(name, i, priority);
      return t;
    }
    tween._value = value;
    return tween;
  }

  function transition_styleTween(name, value, priority) {
    var key = "style." + (name += "");
    if (arguments.length < 2) return (key = this.tween(key)) && key._value;
    if (value == null) return this.tween(key, null);
    if (typeof value !== "function") throw new Error;
    return this.tween(key, styleTween(name, value, priority == null ? "" : priority));
  }

  function textConstant$1(value) {
    return function() {
      this.textContent = value;
    };
  }

  function textFunction$1(value) {
    return function() {
      var value1 = value(this);
      this.textContent = value1 == null ? "" : value1;
    };
  }

  function transition_text(value) {
    return this.tween("text", typeof value === "function"
        ? textFunction$1(tweenValue(this, "text", value))
        : textConstant$1(value == null ? "" : value + ""));
  }

  function textInterpolate(i) {
    return function(t) {
      this.textContent = i.call(this, t);
    };
  }

  function textTween(value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0) t0 = (i0 = i) && textInterpolate(i);
      return t0;
    }
    tween._value = value;
    return tween;
  }

  function transition_textTween(value) {
    var key = "text";
    if (arguments.length < 1) return (key = this.tween(key)) && key._value;
    if (value == null) return this.tween(key, null);
    if (typeof value !== "function") throw new Error;
    return this.tween(key, textTween(value));
  }

  function transition_transition() {
    var name = this._name,
        id0 = this._id,
        id1 = newId();

    for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          var inherit = get$1(node, id0);
          schedule(node, name, id1, i, group, {
            time: inherit.time + inherit.delay + inherit.duration,
            delay: 0,
            duration: inherit.duration,
            ease: inherit.ease
          });
        }
      }
    }

    return new Transition(groups, this._parents, name, id1);
  }

  function transition_end() {
    var on0, on1, that = this, id = that._id, size = that.size();
    return new Promise(function(resolve, reject) {
      var cancel = {value: reject},
          end = {value: function() { if (--size === 0) resolve(); }};

      that.each(function() {
        var schedule = set$2(this, id),
            on = schedule.on;

        // If this node shared a dispatch with the previous node,
        // just assign the updated shared dispatch and we’re done!
        // Otherwise, copy-on-write.
        if (on !== on0) {
          on1 = (on0 = on).copy();
          on1._.cancel.push(cancel);
          on1._.interrupt.push(cancel);
          on1._.end.push(end);
        }

        schedule.on = on1;
      });
    });
  }

  var id = 0;

  function Transition(groups, parents, name, id) {
    this._groups = groups;
    this._parents = parents;
    this._name = name;
    this._id = id;
  }

  function transition(name) {
    return selection().transition(name);
  }

  function newId() {
    return ++id;
  }

  var selection_prototype = selection.prototype;

  Transition.prototype = transition.prototype = {
    constructor: Transition,
    select: transition_select,
    selectAll: transition_selectAll,
    filter: transition_filter,
    merge: transition_merge,
    selection: transition_selection,
    transition: transition_transition,
    call: selection_prototype.call,
    nodes: selection_prototype.nodes,
    node: selection_prototype.node,
    size: selection_prototype.size,
    empty: selection_prototype.empty,
    each: selection_prototype.each,
    on: transition_on,
    attr: transition_attr,
    attrTween: transition_attrTween,
    style: transition_style,
    styleTween: transition_styleTween,
    text: transition_text,
    textTween: transition_textTween,
    remove: transition_remove,
    tween: transition_tween,
    delay: transition_delay,
    duration: transition_duration,
    ease: transition_ease,
    end: transition_end
  };

  function cubicInOut(t) {
    return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
  }

  var defaultTiming = {
    time: null, // Set on use.
    delay: 0,
    duration: 250,
    ease: cubicInOut
  };

  function inherit(node, id) {
    var timing;
    while (!(timing = node.__transition) || !(timing = timing[id])) {
      if (!(node = node.parentNode)) {
        return defaultTiming.time = now(), defaultTiming;
      }
    }
    return timing;
  }

  function selection_transition(name) {
    var id,
        timing;

    if (name instanceof Transition) {
      id = name._id, name = name._name;
    } else {
      id = newId(), (timing = defaultTiming).time = now(), name = name == null ? null : name + "";
    }

    for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          schedule(node, name, id, i, group, timing || inherit(node, id));
        }
      }
    }

    return new Transition(groups, this._parents, name, id);
  }

  selection.prototype.interrupt = selection_interrupt;
  selection.prototype.transition = selection_transition;

  var party_colors = {
      "AFRICAN NATIONAL CONGRESS" : "#00993f",
      "DEMOCRATIC ALLIANCE" : "#015CA3",
      "INKATHA FREEDOM PARTY" : "E91C23",
      "ECONOMIC FREEDOM FIGHTERS" : "#850000",
      "CONGRESS  OF THE PEOPLE" : "#FFCA08",
      "AFRICAN CHRISTIAN DEMOCRATIC PARTY" : "#005284",
      "UNITED DEMOCRATIC MOVEMENT" : "#FDB415",
      "VRYHEIDSFRONT PLUS" : "#017F01",
      "AGANG SOUTH AFRICA" : "#00764B",
      "AZANIAN PEOPLE'S ORGANISATION" : "#622F06",
      "PAN AFRICANIST CONGRESS OF AZANIA" : "#036637",
  };

  var parties = [
    {
      "male": 5,
      "female": 2,
      "medianAge": 28,
      "party": "GAMAGARA COMMUNITY FORUM",
      "total": 7,
      "femaleRatio": 0.2857142857142857,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 37
    },
    {
      "male": 98,
      "female": 122,
      "medianAge": 41,
      "party": "AGENCY FOR NEW AGENDA",
      "total": 220,
      "femaleRatio": 0.5545454545454546,
      "wardRatio": 0,
      "prRatio": 0.5570776255707762,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.55,
      "top10MedianAge": 55
    },
    {
      "male": 31,
      "female": 19,
      "medianAge": 34.5,
      "party": "SINDAWONYE PROGRESSIVE PARTY",
      "total": 50,
      "femaleRatio": 0.38,
      "wardRatio": 0.4,
      "prRatio": 0.375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.375,
      "top10MedianAge": 41.5
    },
    {
      "male": 408,
      "female": 277,
      "medianAge": 51,
      "party": "GOOD",
      "total": 685,
      "femaleRatio": 0.4043795620437956,
      "wardRatio": 0.3880597014925373,
      "prRatio": 0.40834845735027225,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.397212543554007,
      "top10MedianAge": 43
    },
    {
      "male": 20,
      "female": 14,
      "medianAge": 52,
      "party": "DECENT POLITICAL PARTY",
      "total": 34,
      "femaleRatio": 0.4117647058823529,
      "wardRatio": 0,
      "prRatio": 0.4117647058823529,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 47
    },
    {
      "male": 13,
      "female": 1,
      "medianAge": 43.5,
      "party": "WITZENBERG AKSIE",
      "total": 14,
      "femaleRatio": 0.07142857142857142,
      "wardRatio": 0.1111111111111111,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 52
    },
    {
      "male": 6,
      "female": 4,
      "medianAge": 40.5,
      "party": "INDEPENDENT PARTY",
      "total": 10,
      "femaleRatio": 0.4,
      "wardRatio": 0.5,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 44.5
    },
    {
      "male": 6,
      "female": 4,
      "medianAge": 38.5,
      "party": "MAKANA INDEPENDENT NEW DEAL",
      "total": 10,
      "femaleRatio": 0.4,
      "wardRatio": 0,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 38.5
    },
    {
      "male": 12,
      "female": 5,
      "medianAge": 39,
      "party": "NATIONAL ECONOMIC FIGHTERS",
      "total": 17,
      "femaleRatio": 0.29411764705882354,
      "wardRatio": 0,
      "prRatio": 0.38461538461538464,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.38461538461538464,
      "top10MedianAge": 47
    },
    {
      "male": 47,
      "female": 24,
      "medianAge": 37,
      "party": "REPUBLICAN CONFERENCE OF TSHWANE",
      "total": 71,
      "femaleRatio": 0.3380281690140845,
      "wardRatio": 0.5,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 38.5
    },
    {
      "male": 5,
      "female": 2,
      "medianAge": 43,
      "party": "METSIMAHOLO PROGRESSIVE PEOPLE FORUM",
      "total": 7,
      "femaleRatio": 0.2857142857142857,
      "wardRatio": 0,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2857142857142857,
      "top10MedianAge": 43
    },
    {
      "male": 2,
      "female": 0,
      "medianAge": 32,
      "party": "AFRICAN MANDATE CONGRESS",
      "total": 2,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 32
    },
    {
      "male": 1413,
      "female": 739,
      "medianAge": 39.5,
      "party": "INKATHA FREEDOM PARTY",
      "total": 2152,
      "femaleRatio": 0.3434014869888476,
      "wardRatio": 0.263573543928924,
      "prRatio": 0.41439859525899914,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.41185410334346506,
      "top10MedianAge": 44
    },
    {
      "male": 3,
      "female": 4,
      "medianAge": 46,
      "party": "INGUBO YESKHETHU PARTY",
      "total": 7,
      "femaleRatio": 0.5714285714285714,
      "wardRatio": 0,
      "prRatio": 0.5714285714285714,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5714285714285714,
      "top10MedianAge": 46
    },
    {
      "male": 40,
      "female": 49,
      "medianAge": 47,
      "party": "SOUTH AFRICAN ROYAL KINGDOMS ORGANIZATION",
      "total": 89,
      "femaleRatio": 0.550561797752809,
      "wardRatio": 0.8,
      "prRatio": 0.5189873417721519,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5405405405405406,
      "top10MedianAge": 33.5
    },
    {
      "male": 49,
      "female": 43,
      "medianAge": 53,
      "party": "ACADEMIC CONGRESS UNION",
      "total": 92,
      "femaleRatio": 0.4673913043478261,
      "wardRatio": 0.625,
      "prRatio": 0.4523809523809524,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4782608695652174,
      "top10MedianAge": 48
    },
    {
      "male": 6,
      "female": 3,
      "medianAge": 47,
      "party": "DIKGATLONG INDEPENDED FORUM",
      "total": 9,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 38
    },
    {
      "male": 11,
      "female": 15,
      "medianAge": 45.5,
      "party": "MOVEMENT DEMOCRATIC CONGRESS",
      "total": 26,
      "femaleRatio": 0.5769230769230769,
      "wardRatio": 0,
      "prRatio": 0.6,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.45454545454545453,
      "top10MedianAge": 37
    },
    {
      "male": 4,
      "female": 6,
      "medianAge": 25.5,
      "party": "PONGOLA PEOPLE'S PARTY",
      "total": 10,
      "femaleRatio": 0.6,
      "wardRatio": 0.6,
      "prRatio": 0.6,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 122
    },
    {
      "male": 14,
      "female": 7,
      "medianAge": 51,
      "party": "IQELA LENTSANGO - DAGGA PARTY",
      "total": 21,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3076923076923077,
      "top10MedianAge": 50
    },
    {
      "male": 11,
      "female": 6,
      "medianAge": 31,
      "party": "DEMOCRATIC NEW CIVIC ASSOCIATION",
      "total": 17,
      "femaleRatio": 0.35294117647058826,
      "wardRatio": 0.2857142857142857,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 42.5
    },
    {
      "male": 4,
      "female": 0,
      "medianAge": 28.5,
      "party": "UNEMPLOYMENT MOVEMENT SA",
      "total": 4,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 28.5
    },
    {
      "male": 128,
      "female": 81,
      "medianAge": 59,
      "party": "INDEPENDENT CIVIC ORGANISATION OF SOUTH AFRICA",
      "total": 209,
      "femaleRatio": 0.3875598086124402,
      "wardRatio": 0.39215686274509803,
      "prRatio": 0.3860759493670886,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3389830508474576,
      "top10MedianAge": 35
    },
    {
      "male": 10,
      "female": 10,
      "medianAge": 40,
      "party": "SIYATHEMBA COMMUNITY MOVEMENT",
      "total": 20,
      "femaleRatio": 0.5,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.5714285714285714,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5714285714285714,
      "top10MedianAge": 43
    },
    {
      "male": 42,
      "female": 28,
      "medianAge": 49,
      "party": "XIMOKO PARTY",
      "total": 70,
      "femaleRatio": 0.4,
      "wardRatio": 0.4444444444444444,
      "prRatio": 0.38461538461538464,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.35555555555555557,
      "top10MedianAge": 63
    },
    {
      "male": 4,
      "female": 1,
      "medianAge": 56,
      "party": "INDEPENDENT PEOPLE'S PARTY",
      "total": 5,
      "femaleRatio": 0.2,
      "wardRatio": 0,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 60
    },
    {
      "male": 26,
      "female": 20,
      "medianAge": 61,
      "party": "BREEDEVALLEI ONAFHANKLIK",
      "total": 46,
      "femaleRatio": 0.43478260869565216,
      "wardRatio": 0.4,
      "prRatio": 0.46153846153846156,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.47619047619047616,
      "top10MedianAge": 49
    },
    {
      "male": 16,
      "female": 19,
      "medianAge": 33,
      "party": "AFRICAN FREEDOM PARTY",
      "total": 35,
      "femaleRatio": 0.5428571428571428,
      "wardRatio": 1,
      "prRatio": 0.5151515151515151,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 37
    },
    {
      "male": 6,
      "female": 0,
      "medianAge": 46.5,
      "party": "LANGERBERG INDEPENDENT PARTY",
      "total": 6,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 50.5
    },
    {
      "male": 13,
      "female": 7,
      "medianAge": 48,
      "party": "ECONOMIC LIBERATION CONGRESS",
      "total": 20,
      "femaleRatio": 0.35,
      "wardRatio": 0.14285714285714285,
      "prRatio": 0.46153846153846156,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.46153846153846156,
      "top10MedianAge": 53
    },
    {
      "male": 9,
      "female": 7,
      "medianAge": 39,
      "party": "DENNILTON RESIDENTS ASSOCIATION",
      "total": 16,
      "femaleRatio": 0.4375,
      "wardRatio": 0.25,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 44
    },
    {
      "male": 11,
      "female": 3,
      "medianAge": 45,
      "party": "SOCIALIST ECONOMIC FREEDOM MOVEMENT",
      "total": 14,
      "femaleRatio": 0.21428571428571427,
      "wardRatio": 0.16666666666666666,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 48
    },
    {
      "male": 14,
      "female": 10,
      "medianAge": 43,
      "party": "CHANGE",
      "total": 24,
      "femaleRatio": 0.4166666666666667,
      "wardRatio": 0,
      "prRatio": 0.4166666666666667,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.35,
      "top10MedianAge": 41.5
    },
    {
      "male": 10,
      "female": 6,
      "medianAge": 36.5,
      "party": "KAROO GEMEENSKAP PARTY",
      "total": 16,
      "femaleRatio": 0.375,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.38461538461538464,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.38461538461538464,
      "top10MedianAge": 49
    },
    {
      "male": 49,
      "female": 21,
      "medianAge": 42.5,
      "party": "MAPSIXTEEN CIVIC MOVEMENT",
      "total": 70,
      "femaleRatio": 0.3,
      "wardRatio": 0.22857142857142856,
      "prRatio": 0.37142857142857144,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 45
    },
    {
      "male": 29,
      "female": 10,
      "medianAge": 40,
      "party": "SAVE MADIBENG",
      "total": 39,
      "femaleRatio": 0.2564102564102564,
      "wardRatio": 0.23076923076923078,
      "prRatio": 0.3076923076923077,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3076923076923077,
      "top10MedianAge": 51
    },
    {
      "male": 61,
      "female": 51,
      "medianAge": 36,
      "party": "POWER OF AFRICANS UNITY",
      "total": 112,
      "femaleRatio": 0.45535714285714285,
      "wardRatio": 0.5,
      "prRatio": 0.4358974358974359,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.39622641509433965,
      "top10MedianAge": 52
    },
    {
      "male": 26,
      "female": 18,
      "medianAge": 27,
      "party": "NATIONAL DEMOCRATIC CONVENTION",
      "total": 44,
      "femaleRatio": 0.4090909090909091,
      "wardRatio": 0,
      "prRatio": 0.43902439024390244,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5416666666666666,
      "top10MedianAge": 28.5
    },
    {
      "male": 3,
      "female": 1,
      "medianAge": 48,
      "party": "ADVIESKANTOOR",
      "total": 4,
      "femaleRatio": 0.25,
      "wardRatio": 0,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 48
    },
    {
      "male": 13,
      "female": 5,
      "medianAge": 35.5,
      "party": "LEPHALALE RESIDENTS PARTY",
      "total": 18,
      "femaleRatio": 0.2777777777777778,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.26666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 36
    },
    {
      "male": 2,
      "female": 4,
      "medianAge": 49.5,
      "party": "SOUTH AFRICAN POLITICAL ASSOCIATION",
      "total": 6,
      "femaleRatio": 0.6666666666666666,
      "wardRatio": 1,
      "prRatio": 0.6,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 48
    },
    {
      "male": 32,
      "female": 19,
      "medianAge": 58,
      "party": "PEOPLE'S DEMOCRATIC MOVEMENT",
      "total": 51,
      "femaleRatio": 0.37254901960784315,
      "wardRatio": 0.42857142857142855,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.21428571428571427,
      "top10MedianAge": 50.5
    },
    {
      "male": 5,
      "female": 0,
      "medianAge": 59,
      "party": "KHOI-SAN HEAVENLY PARTY",
      "total": 5,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 59
    },
    {
      "male": 18,
      "female": 36,
      "medianAge": 36.5,
      "party": "AFRICAN DEMOCRATS",
      "total": 54,
      "femaleRatio": 0.6666666666666666,
      "wardRatio": 0.8888888888888888,
      "prRatio": 0.5555555555555556,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5625,
      "top10MedianAge": 42.5
    },
    {
      "male": 44,
      "female": 46,
      "medianAge": 49.5,
      "party": "ADVANCED DYNAMIC ALLIANCE",
      "total": 90,
      "femaleRatio": 0.5111111111111111,
      "wardRatio": 0,
      "prRatio": 0.5111111111111111,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 45.5
    },
    {
      "male": 13,
      "female": 16,
      "medianAge": 39,
      "party": "SOUTH AFRICA VUKA MOVEMENT",
      "total": 29,
      "femaleRatio": 0.5517241379310345,
      "wardRatio": 0.5625,
      "prRatio": 0.5384615384615384,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5384615384615384,
      "top10MedianAge": 46
    },
    {
      "male": 34,
      "female": 42,
      "medianAge": 30,
      "party": "THE NATIONALS OF SOUTH AFRICA",
      "total": 76,
      "femaleRatio": 0.5526315789473685,
      "wardRatio": 0,
      "prRatio": 0.5675675675675675,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7,
      "top10MedianAge": 37
    },
    {
      "male": 15,
      "female": 8,
      "medianAge": 32,
      "party": "TRULY ALLIANCE",
      "total": 23,
      "femaleRatio": 0.34782608695652173,
      "wardRatio": 0.5,
      "prRatio": 0.26666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.1,
      "top10MedianAge": 53
    },
    {
      "male": 90,
      "female": 67,
      "medianAge": 48,
      "party": "INDEPENDENT CITIZENS MOVEMENT",
      "total": 157,
      "femaleRatio": 0.4267515923566879,
      "wardRatio": 0.4065934065934066,
      "prRatio": 0.45454545454545453,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 29.5
    },
    {
      "male": 46,
      "female": 12,
      "medianAge": 36.5,
      "party": "DEMOCRATIC COMMUNITY MOVEMENT",
      "total": 58,
      "femaleRatio": 0.20689655172413793,
      "wardRatio": 0.15625,
      "prRatio": 0.2692307692307692,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.1,
      "top10MedianAge": 55.5
    },
    {
      "male": 7,
      "female": 4,
      "medianAge": 51,
      "party": "AFRICAN BASIC REPUBLICANS",
      "total": 11,
      "femaleRatio": 0.36363636363636365,
      "wardRatio": 0,
      "prRatio": 0.36363636363636365,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.36363636363636365,
      "top10MedianAge": 51
    },
    {
      "male": 40,
      "female": 32,
      "medianAge": 57,
      "party": "CIVIC WARRIORS",
      "total": 72,
      "femaleRatio": 0.4444444444444444,
      "wardRatio": 0.36363636363636365,
      "prRatio": 0.45901639344262296,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.34285714285714286,
      "top10MedianAge": 47
    },
    {
      "male": 4,
      "female": 2,
      "medianAge": 54,
      "party": "BITOU CONCERNED RESIDENTS",
      "total": 6,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 1,
      "prRatio": 0.2,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 57
    },
    {
      "male": 8,
      "female": 6,
      "medianAge": 57,
      "party": "DEMOCRATIC LIBERAL CONGRESS",
      "total": 14,
      "femaleRatio": 0.42857142857142855,
      "wardRatio": 0,
      "prRatio": 0.42857142857142855,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 53.5
    },
    {
      "male": 28,
      "female": 25,
      "medianAge": 59,
      "party": "SOUTH AFRICA MY HOME RESIDENTS ASSOCIATION",
      "total": 53,
      "femaleRatio": 0.4716981132075472,
      "wardRatio": 0.3888888888888889,
      "prRatio": 0.5142857142857142,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 47.5
    },
    {
      "male": 40,
      "female": 25,
      "medianAge": 27,
      "party": "UNITED CULTURAL MOVEMENT",
      "total": 65,
      "femaleRatio": 0.38461538461538464,
      "wardRatio": 0.37209302325581395,
      "prRatio": 0.4090909090909091,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4090909090909091,
      "top10MedianAge": 43
    },
    {
      "male": 521,
      "female": 419,
      "medianAge": 49.5,
      "party": "CONGRESS  OF THE PEOPLE",
      "total": 940,
      "femaleRatio": 0.44574468085106383,
      "wardRatio": 0.43119266055045874,
      "prRatio": 0.4535073409461664,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.46357615894039733,
      "top10MedianAge": 29
    },
    {
      "male": 10,
      "female": 3,
      "medianAge": 49,
      "party": "AFRICAN ISLAMIC MOVEMENT",
      "total": 13,
      "femaleRatio": 0.23076923076923078,
      "wardRatio": 0,
      "prRatio": 0.23076923076923078,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 38
    },
    {
      "male": 12,
      "female": 5,
      "medianAge": 37,
      "party": "NALA COMMUNITY FORUM",
      "total": 17,
      "femaleRatio": 0.29411764705882354,
      "wardRatio": 0.375,
      "prRatio": 0.2222222222222222,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2222222222222222,
      "top10MedianAge": 39
    },
    {
      "male": 25,
      "female": 14,
      "medianAge": 62,
      "party": "AFRICA'S NEW DAWN",
      "total": 39,
      "femaleRatio": 0.358974358974359,
      "wardRatio": 0.3125,
      "prRatio": 0.391304347826087,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.375,
      "top10MedianAge": 45
    },
    {
      "male": 10,
      "female": 9,
      "medianAge": 29,
      "party": "US THE PEOPLE",
      "total": 19,
      "femaleRatio": 0.47368421052631576,
      "wardRatio": 0.8,
      "prRatio": 0.35714285714285715,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 26
    },
    {
      "male": 7,
      "female": 4,
      "medianAge": 53,
      "party": "SAVE TSANTSABANE COALITION",
      "total": 11,
      "femaleRatio": 0.36363636363636365,
      "wardRatio": 0,
      "prRatio": 0.36363636363636365,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 44
    },
    {
      "male": 6,
      "female": 2,
      "medianAge": 45.5,
      "party": "KNYSNA UNITY CONGRESS",
      "total": 8,
      "femaleRatio": 0.25,
      "wardRatio": 0,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 45.5
    },
    {
      "male": 13,
      "female": 4,
      "medianAge": 26,
      "party": "VAAL ALTERNATIVE ALLIANCE LEKGOTLA",
      "total": 17,
      "femaleRatio": 0.23529411764705882,
      "wardRatio": 0,
      "prRatio": 0.23529411764705882,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2727272727272727,
      "top10MedianAge": 28
    },
    {
      "male": 9,
      "female": 3,
      "medianAge": 55.5,
      "party": "CAPE MUSLIM CONGRESS",
      "total": 12,
      "femaleRatio": 0.25,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.2222222222222222,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2222222222222222,
      "top10MedianAge": 55
    },
    {
      "male": 9,
      "female": 9,
      "medianAge": 41.5,
      "party": "CAPRICORN INDEPENDENT COMMUNITY ACTIVISTS FORUM",
      "total": 18,
      "femaleRatio": 0.5,
      "wardRatio": 0.5,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 43.5
    },
    {
      "male": 6,
      "female": 3,
      "medianAge": 29,
      "party": "PHOKWANE SERVICE DELIVERY FORUM",
      "total": 9,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0.25,
      "prRatio": 1,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 1,
      "top10MedianAge": 24
    },
    {
      "male": 884,
      "female": 677,
      "medianAge": 56,
      "party": "PATRIOTIC ALLIANCE",
      "total": 1561,
      "femaleRatio": 0.4336963484945548,
      "wardRatio": 0.3983606557377049,
      "prRatio": 0.45636172450052576,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4185303514376997,
      "top10MedianAge": 52
    },
    {
      "male": 9,
      "female": 2,
      "medianAge": 37,
      "party": "DEMOCRATIC PEOPLE'S CONGRESS",
      "total": 11,
      "femaleRatio": 0.18181818181818182,
      "wardRatio": 0,
      "prRatio": 0.18181818181818182,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.18181818181818182,
      "top10MedianAge": 37
    },
    {
      "male": 7,
      "female": 2,
      "medianAge": 69,
      "party": "CHRISTIAN DEMOCRATIC PARTY",
      "total": 9,
      "femaleRatio": 0.2222222222222222,
      "wardRatio": 0,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 65.5
    },
    {
      "male": 1,
      "female": 1,
      "medianAge": 38,
      "party": "SOUTH AFRICAN PEOPLES MOVEMENT",
      "total": 2,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 38
    },
    {
      "male": 224,
      "female": 202,
      "medianAge": 46.5,
      "party": "SPECTRUM NATIONAL PARTY",
      "total": 426,
      "femaleRatio": 0.47417840375586856,
      "wardRatio": 0.504424778761062,
      "prRatio": 0.46325878594249204,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.436046511627907,
      "top10MedianAge": 46
    },
    {
      "male": 9,
      "female": 4,
      "medianAge": 37,
      "party": "INTERNATIONAL PARTY",
      "total": 13,
      "femaleRatio": 0.3076923076923077,
      "wardRatio": 0,
      "prRatio": 0.3076923076923077,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3076923076923077,
      "top10MedianAge": 37
    },
    {
      "male": 33,
      "female": 26,
      "medianAge": 41,
      "party": "ABANTU INTEGRITY MOVEMENT",
      "total": 59,
      "femaleRatio": 0.4406779661016949,
      "wardRatio": 0.43103448275862066,
      "prRatio": 1,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 1,
      "top10MedianAge": 29
    },
    {
      "male": 4,
      "female": 0,
      "medianAge": 46.5,
      "party": "MANGAUNG COMMUNITY FORUM",
      "total": 4,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 46.5
    },
    {
      "male": 53,
      "female": 60,
      "medianAge": 58,
      "party": "GOD SAVE AFRICA",
      "total": 113,
      "femaleRatio": 0.5309734513274337,
      "wardRatio": 0.47368421052631576,
      "prRatio": 0.5425531914893617,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5256410256410257,
      "top10MedianAge": 60
    },
    {
      "male": 425,
      "female": 448,
      "medianAge": 36,
      "party": "AFRICAN PEOPLE'S CONVENTION",
      "total": 873,
      "femaleRatio": 0.5131729667812142,
      "wardRatio": 0.5189393939393939,
      "prRatio": 0.5106732348111659,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.46539379474940334,
      "top10MedianAge": 55
    },
    {
      "male": 112,
      "female": 59,
      "medianAge": 49,
      "party": "ACTIVISTS MOVEMENT OF SOUTH AFRICA",
      "total": 171,
      "femaleRatio": 0.34502923976608185,
      "wardRatio": 0.3,
      "prRatio": 0.3509933774834437,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.34285714285714286,
      "top10MedianAge": 46
    },
    {
      "male": 4,
      "female": 5,
      "medianAge": 43,
      "party": "KNYSNA INDEPENDENT MOVEMENT",
      "total": 9,
      "femaleRatio": 0.5555555555555556,
      "wardRatio": 0,
      "prRatio": 0.5555555555555556,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5555555555555556,
      "top10MedianAge": 43
    },
    {
      "male": 1,
      "female": 2,
      "medianAge": 30,
      "party": "CONGREGATIONAL CHRISTIAN UNITY",
      "total": 3,
      "femaleRatio": 0.6666666666666666,
      "wardRatio": 0,
      "prRatio": 0.6666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6666666666666666,
      "top10MedianAge": 30
    },
    {
      "male": 28,
      "female": 45,
      "medianAge": 65,
      "party": "ECONOMIC EMANCIPATION FORUM",
      "total": 73,
      "femaleRatio": 0.6164383561643836,
      "wardRatio": 0.56,
      "prRatio": 0.6458333333333334,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5161290322580645,
      "top10MedianAge": 57
    },
    {
      "male": 10,
      "female": 3,
      "medianAge": 62,
      "party": "TRANSFORMING DRAKENSTEIN COMMUNITY FORUM",
      "total": 13,
      "femaleRatio": 0.23076923076923078,
      "wardRatio": 0,
      "prRatio": 0.23076923076923078,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 52.5
    },
    {
      "male": 183,
      "female": 142,
      "medianAge": 38,
      "party": "UNITED INDEPENDENT MOVEMENT",
      "total": 325,
      "femaleRatio": 0.4369230769230769,
      "wardRatio": 0.3225806451612903,
      "prRatio": 0.4489795918367347,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.35714285714285715,
      "top10MedianAge": 48.5
    },
    {
      "male": 24,
      "female": 14,
      "medianAge": 28,
      "party": "MALAMULELE COMMUNITY ASSOCIATION",
      "total": 38,
      "femaleRatio": 0.3684210526315789,
      "wardRatio": 0,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.45454545454545453,
      "top10MedianAge": 31
    },
    {
      "male": 15,
      "female": 9,
      "medianAge": 48.5,
      "party": "UNITED FRONT OF THE EASTERN CAPE",
      "total": 24,
      "femaleRatio": 0.375,
      "wardRatio": 0.3888888888888889,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 38.5
    },
    {
      "male": 159,
      "female": 101,
      "medianAge": 36.5,
      "party": "INDEPENDENT SOUTH AFRICAN NATIONAL CIVIC ORGANISATION",
      "total": 260,
      "femaleRatio": 0.38846153846153847,
      "wardRatio": 0.3880597014925373,
      "prRatio": 0.38860103626943004,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.36419753086419754,
      "top10MedianAge": 34
    },
    {
      "male": 19,
      "female": 12,
      "medianAge": 53,
      "party": "ACTIVE UNITED FRONT",
      "total": 31,
      "femaleRatio": 0.3870967741935484,
      "wardRatio": 0,
      "prRatio": 0.3870967741935484,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.38461538461538464,
      "top10MedianAge": 43.5
    },
    {
      "male": 2763,
      "female": 1806,
      "medianAge": 34,
      "party": "ECONOMIC FREEDOM FIGHTERS",
      "total": 4569,
      "femaleRatio": 0.3952724885095207,
      "wardRatio": 0.39198888631627693,
      "prRatio": 0.452,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.452,
      "top10MedianAge": 35
    },
    {
      "male": 9,
      "female": 8,
      "medianAge": 30,
      "party": "BATHO BA QETILE",
      "total": 17,
      "femaleRatio": 0.47058823529411764,
      "wardRatio": 0.4666666666666667,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 40
    },
    {
      "male": 7,
      "female": 9,
      "medianAge": 33.5,
      "party": "BATHO PELE PARTY",
      "total": 16,
      "femaleRatio": 0.5625,
      "wardRatio": 0,
      "prRatio": 0.5625,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5625,
      "top10MedianAge": 33.5
    },
    {
      "male": 45,
      "female": 46,
      "medianAge": 44,
      "party": "MAGOSHI SWARANANG MOVEMENT",
      "total": 91,
      "femaleRatio": 0.5054945054945055,
      "wardRatio": 0.5526315789473685,
      "prRatio": 0.26666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.23076923076923078,
      "top10MedianAge": 57
    },
    {
      "male": 52,
      "female": 50,
      "medianAge": 42,
      "party": "KINGDOM COVENANT DEMOCRATIC PARTY",
      "total": 102,
      "femaleRatio": 0.49019607843137253,
      "wardRatio": 0.5555555555555556,
      "prRatio": 0.47619047619047616,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4745762711864407,
      "top10MedianAge": 42
    },
    {
      "male": 783,
      "female": 554,
      "medianAge": 26,
      "party": "AFRICAN CHRISTIAN DEMOCRATIC PARTY",
      "total": 1337,
      "femaleRatio": 0.4143605086013463,
      "wardRatio": 0.41642228739002934,
      "prRatio": 0.41365461847389556,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4195906432748538,
      "top10MedianAge": 48.5
    },
    {
      "male": 3,
      "female": 0,
      "medianAge": 40,
      "party": "REVOLUTIONARY DEMOCRATIC PATRIOTS",
      "total": 3,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 40
    },
    {
      "male": 3,
      "female": 1,
      "medianAge": 38.5,
      "party": "UMNOTHO DEMOCRATIC FRONT",
      "total": 4,
      "femaleRatio": 0.25,
      "wardRatio": 0,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 38.5
    },
    {
      "male": 15,
      "female": 39,
      "medianAge": 48.5,
      "party": "ROYAL LOYAL PROGRESS",
      "total": 54,
      "femaleRatio": 0.7222222222222222,
      "wardRatio": 0.6363636363636364,
      "prRatio": 0.7441860465116279,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6774193548387096,
      "top10MedianAge": 40
    },
    {
      "male": 49,
      "female": 52,
      "medianAge": 30,
      "party": "AFRICAN MANTUNGWA COMMUNITY",
      "total": 101,
      "femaleRatio": 0.5148514851485149,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.5204081632653061,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5268817204301075,
      "top10MedianAge": 31
    },
    {
      "male": 6,
      "female": 8,
      "medianAge": 51,
      "party": "MORETELE PEOPLES PARTY",
      "total": 14,
      "femaleRatio": 0.5714285714285714,
      "wardRatio": 0,
      "prRatio": 0.5714285714285714,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5714285714285714,
      "top10MedianAge": 51
    },
    {
      "male": 2,
      "female": 8,
      "medianAge": 36.5,
      "party": "GAZA YOUTH REVOLUTION",
      "total": 10,
      "femaleRatio": 0.8,
      "wardRatio": 0.8,
      "prRatio": 0.8,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.8,
      "top10MedianAge": 28
    },
    {
      "male": 5,
      "female": 3,
      "medianAge": 26.5,
      "party": "TRANSFORMATIVE YOUTH MOVEMENT",
      "total": 8,
      "femaleRatio": 0.375,
      "wardRatio": 1,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2857142857142857,
      "top10MedianAge": 26
    },
    {
      "male": 167,
      "female": 89,
      "medianAge": 49,
      "party": "AL JAMA-AH",
      "total": 256,
      "femaleRatio": 0.34765625,
      "wardRatio": 0.3723404255319149,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.33620689655172414,
      "top10MedianAge": 49
    },
    {
      "male": 5,
      "female": 5,
      "medianAge": 36.5,
      "party": "SHOSHOLOZA PROGRESSIVE PARTY",
      "total": 10,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4444444444444444,
      "top10MedianAge": 46
    },
    {
      "male": 6,
      "female": 21,
      "medianAge": 51,
      "party": "IKHWEZI POLITICAL MOVEMENT",
      "total": 27,
      "femaleRatio": 0.7777777777777778,
      "wardRatio": 0.8333333333333334,
      "prRatio": 0.7619047619047619,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7647058823529411,
      "top10MedianAge": 32
    },
    {
      "male": 39,
      "female": 35,
      "medianAge": 46,
      "party": "PEOPLE'S REVOLUTIONARY MOVEMENT",
      "total": 74,
      "femaleRatio": 0.47297297297297297,
      "wardRatio": 0.475,
      "prRatio": 0.47058823529411764,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.42857142857142855,
      "top10MedianAge": 37
    },
    {
      "male": 238,
      "female": 118,
      "medianAge": 50,
      "party": "AZANIAN PEOPLE'S ORGANISATION",
      "total": 356,
      "femaleRatio": 0.33146067415730335,
      "wardRatio": 0.3582089552238806,
      "prRatio": 0.3153153153153153,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3005181347150259,
      "top10MedianAge": 51
    },
    {
      "male": 15,
      "female": 10,
      "medianAge": 55,
      "party": "PROPHETIC MOVEMENT ARMY",
      "total": 25,
      "femaleRatio": 0.4,
      "wardRatio": 0,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4444444444444444,
      "top10MedianAge": 37
    },
    {
      "male": 33,
      "female": 22,
      "medianAge": 48,
      "party": "NATIONAL PEOPLES AMBASSADORS",
      "total": 55,
      "femaleRatio": 0.4,
      "wardRatio": 0.44,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 48
    },
    {
      "male": 17,
      "female": 22,
      "medianAge": 29,
      "party": "THABAZIMBI RESIDENTS ASSOCIATION",
      "total": 39,
      "femaleRatio": 0.5641025641025641,
      "wardRatio": 0.5454545454545454,
      "prRatio": 0.5714285714285714,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.55,
      "top10MedianAge": 51.5
    },
    {
      "male": 25,
      "female": 24,
      "medianAge": 48,
      "party": "GAZA MOVEMENT FOR CHANGE",
      "total": 49,
      "femaleRatio": 0.4897959183673469,
      "wardRatio": 0.46153846153846156,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2777777777777778,
      "top10MedianAge": 56.5
    },
    {
      "male": 13,
      "female": 9,
      "medianAge": 63.5,
      "party": "AFRICAN COVENANT",
      "total": 22,
      "femaleRatio": 0.4090909090909091,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.42105263157894735,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.375,
      "top10MedianAge": 49
    },
    {
      "male": 20,
      "female": 4,
      "medianAge": 41,
      "party": "LEKWA COMMUNITY FORUM",
      "total": 24,
      "femaleRatio": 0.16666666666666666,
      "wardRatio": 0.07142857142857142,
      "prRatio": 0.3,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 36
    },
    {
      "male": 33,
      "female": 26,
      "medianAge": 34,
      "party": "AFRICAN VOICE PROGRESSIVE PARTY",
      "total": 59,
      "femaleRatio": 0.4406779661016949,
      "wardRatio": 0.3181818181818182,
      "prRatio": 0.5135135135135135,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4642857142857143,
      "top10MedianAge": 32
    },
    {
      "male": 236,
      "female": 210,
      "medianAge": 37,
      "party": "UNITED CHRISTIAN DEMOCRATIC PARTY",
      "total": 446,
      "femaleRatio": 0.47085201793721976,
      "wardRatio": 0.41509433962264153,
      "prRatio": 0.48823529411764705,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.49407114624505927,
      "top10MedianAge": 43
    },
    {
      "male": 8,
      "female": 5,
      "medianAge": 48,
      "party": "EQUAL RIGHTS FOR ALL",
      "total": 13,
      "femaleRatio": 0.38461538461538464,
      "wardRatio": 0.375,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 42
    },
    {
      "male": 36,
      "female": 18,
      "medianAge": 31.5,
      "party": "AFRICAN AMBASSADORS OF SOUTH AFRICA",
      "total": 54,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0.35714285714285715,
      "prRatio": 0.325,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 46
    },
    {
      "male": 69,
      "female": 44,
      "medianAge": 46,
      "party": "TSOGANG CIVIC MOVEMENT",
      "total": 113,
      "femaleRatio": 0.3893805309734513,
      "wardRatio": 0.34,
      "prRatio": 0.42857142857142855,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.45,
      "top10MedianAge": 43
    },
    {
      "male": 44,
      "female": 7,
      "medianAge": 65,
      "party": "MOPANI INDEPENDENT MOVEMENT",
      "total": 51,
      "femaleRatio": 0.13725490196078433,
      "wardRatio": 0,
      "prRatio": 0.175,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.17857142857142858,
      "top10MedianAge": 50.5
    },
    {
      "male": 11,
      "female": 11,
      "medianAge": 37,
      "party": "BANA BA THARI",
      "total": 22,
      "femaleRatio": 0.5,
      "wardRatio": 0.5384615384615384,
      "prRatio": 0.4444444444444444,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4444444444444444,
      "top10MedianAge": 32
    },
    {
      "male": 166,
      "female": 122,
      "medianAge": 47,
      "party": "AFRICA RESTORATION ALLIANCE",
      "total": 288,
      "femaleRatio": 0.4236111111111111,
      "wardRatio": 0.453125,
      "prRatio": 0.41517857142857145,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.37748344370860926,
      "top10MedianAge": 31
    },
    {
      "male": 19,
      "female": 17,
      "medianAge": 42.5,
      "party": "MIDDELBURG AND HENDRINA RESIDENTS FRONT",
      "total": 36,
      "femaleRatio": 0.4722222222222222,
      "wardRatio": 0.3684210526315789,
      "prRatio": 0.5882352941176471,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5555555555555556,
      "top10MedianAge": 68
    },
    {
      "male": 640,
      "female": 518,
      "medianAge": 42.5,
      "party": "ABANTU BATHO CONGRESS",
      "total": 1158,
      "femaleRatio": 0.4473229706390328,
      "wardRatio": 0.4,
      "prRatio": 0.4785100286532951,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.46292585170340683,
      "top10MedianAge": 40
    },
    {
      "male": 11,
      "female": 10,
      "medianAge": 46,
      "party": "METSIMAHOLO COMMUNITY ASSOCIATION",
      "total": 21,
      "femaleRatio": 0.47619047619047616,
      "wardRatio": 0.45,
      "prRatio": 1,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 1,
      "top10MedianAge": 45
    },
    {
      "male": 24,
      "female": 28,
      "medianAge": 42.5,
      "party": "CONCERNED DRAKENSTEIN RESIDENTS",
      "total": 52,
      "femaleRatio": 0.5384615384615384,
      "wardRatio": 0.5294117647058824,
      "prRatio": 0.5428571428571428,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 52
    },
    {
      "male": 5,
      "female": 2,
      "medianAge": 46,
      "party": "DEMOCRATIC LABOUR PARTY",
      "total": 7,
      "femaleRatio": 0.2857142857142857,
      "wardRatio": 0,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2857142857142857,
      "top10MedianAge": 46
    },
    {
      "male": 8,
      "female": 3,
      "medianAge": 57,
      "party": "SERVICE DELIVERY MOVEMENT",
      "total": 11,
      "femaleRatio": 0.2727272727272727,
      "wardRatio": 0.2857142857142857,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 49.5
    },
    {
      "male": 2935,
      "female": 1846,
      "medianAge": 51,
      "party": "DEMOCRATIC ALLIANCE",
      "total": 4781,
      "femaleRatio": 0.3861116921146204,
      "wardRatio": 0.40978398983481573,
      "prRatio": 0.37449329591518554,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3614058355437666,
      "top10MedianAge": 46
    },
    {
      "male": 10,
      "female": 6,
      "medianAge": 46.5,
      "party": "KHOISAN UNITED MOVEMENT",
      "total": 16,
      "femaleRatio": 0.375,
      "wardRatio": 0,
      "prRatio": 0.375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 57
    },
    {
      "male": 38,
      "female": 40,
      "medianAge": 52,
      "party": "ARUSHA ECONOMIC COALITION",
      "total": 78,
      "femaleRatio": 0.5128205128205128,
      "wardRatio": 0.42857142857142855,
      "prRatio": 0.5211267605633803,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5757575757575758,
      "top10MedianAge": 48
    },
    {
      "male": 27,
      "female": 33,
      "medianAge": 30.5,
      "party": "SOCIALIST REVOLUTIONARY WORKERS PARTY",
      "total": 60,
      "femaleRatio": 0.55,
      "wardRatio": 0.6,
      "prRatio": 0.5454545454545454,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5277777777777778,
      "top10MedianAge": 60
    },
    {
      "male": 5,
      "female": 2,
      "medianAge": 23,
      "party": "THE PEOPLE'S AGENDA",
      "total": 7,
      "femaleRatio": 0.2857142857142857,
      "wardRatio": 0,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2857142857142857,
      "top10MedianAge": 23
    },
    {
      "male": 19,
      "female": 14,
      "medianAge": 50,
      "party": "PATRIOTIC FRONT OF AZANIA",
      "total": 33,
      "femaleRatio": 0.42424242424242425,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.4583333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4090909090909091,
      "top10MedianAge": 38.5
    },
    {
      "male": 86,
      "female": 57,
      "medianAge": 55,
      "party": "CAPE COLOURED CONGRESS",
      "total": 143,
      "femaleRatio": 0.3986013986013986,
      "wardRatio": 0.3114754098360656,
      "prRatio": 0.4634146341463415,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.46875,
      "top10MedianAge": 26
    },
    {
      "male": 22,
      "female": 22,
      "medianAge": 43.5,
      "party": "DEMOCRATIC INDEPENDENT PARTY",
      "total": 44,
      "femaleRatio": 0.5,
      "wardRatio": 0.5,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.35,
      "top10MedianAge": 63.5
    },
    {
      "male": 59,
      "female": 16,
      "medianAge": 45,
      "party": "AFRIKAN ALLIANCE OF SOCIAL DEMOCRATS",
      "total": 75,
      "femaleRatio": 0.21333333333333335,
      "wardRatio": 0.22857142857142856,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 67
    },
    {
      "male": 3,
      "female": 2,
      "medianAge": 34,
      "party": "CHRISTIANS OF SOUTH AFRICA",
      "total": 5,
      "femaleRatio": 0.4,
      "wardRatio": 0,
      "prRatio": 0.6666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6666666666666666,
      "top10MedianAge": 34
    },
    {
      "male": 11,
      "female": 9,
      "medianAge": 48.5,
      "party": "OUR NATION",
      "total": 20,
      "femaleRatio": 0.45,
      "wardRatio": 0.5714285714285714,
      "prRatio": 0.16666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.16666666666666666,
      "top10MedianAge": 50.5
    },
    {
      "male": 3,
      "female": 1,
      "medianAge": 64.5,
      "party": "OUR CITY MATTERS",
      "total": 4,
      "femaleRatio": 0.25,
      "wardRatio": 0,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 64.5
    },
    {
      "male": 17,
      "female": 6,
      "medianAge": 41,
      "party": "SINGUKUKHANYA KWEZWE CHRISTIAN PARTY",
      "total": 23,
      "femaleRatio": 0.2608695652173913,
      "wardRatio": 0,
      "prRatio": 0.2608695652173913,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 49
    },
    {
      "male": 206,
      "female": 184,
      "medianAge": 34,
      "party": "DEFENDERS OF THE PEOPLE",
      "total": 390,
      "femaleRatio": 0.4717948717948718,
      "wardRatio": 0.4957627118644068,
      "prRatio": 0.43506493506493504,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.37777777777777777,
      "top10MedianAge": 34.5
    },
    {
      "male": 35,
      "female": 32,
      "medianAge": 28,
      "party": "DEMOCRATIC ARTISTS PARTY",
      "total": 67,
      "femaleRatio": 0.47761194029850745,
      "wardRatio": 0.2777777777777778,
      "prRatio": 0.5510204081632653,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5428571428571428,
      "top10MedianAge": 34
    },
    {
      "male": 31,
      "female": 107,
      "medianAge": 39.5,
      "party": "SOUTH AFRICAN MAINTANANCE AND ESTATE BENEFICIARIES ASSOCIATI",
      "total": 138,
      "femaleRatio": 0.7753623188405797,
      "wardRatio": 0.7857142857142857,
      "prRatio": 0.7727272727272727,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7111111111111111,
      "top10MedianAge": 48
    },
    {
      "male": 31,
      "female": 23,
      "medianAge": 55.5,
      "party": "DIKWANKWETLA PARTY OF SOUTH AFRICA",
      "total": 54,
      "femaleRatio": 0.42592592592592593,
      "wardRatio": 0.23076923076923078,
      "prRatio": 0.4878048780487805,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5882352941176471,
      "top10MedianAge": 63
    },
    {
      "male": 12,
      "female": 7,
      "medianAge": 51,
      "party": "OUDTSHOORN GEMEENSKAP INISIATIEF",
      "total": 19,
      "femaleRatio": 0.3684210526315789,
      "wardRatio": 0.4444444444444444,
      "prRatio": 0.3,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 51.5
    },
    {
      "male": 45,
      "female": 40,
      "medianAge": 36,
      "party": "CIVIC INDEPENDENT",
      "total": 85,
      "femaleRatio": 0.47058823529411764,
      "wardRatio": 0.375,
      "prRatio": 0.4927536231884058,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.46808510638297873,
      "top10MedianAge": 61
    },
    {
      "male": 27,
      "female": 28,
      "medianAge": 41,
      "party": "ALL UNEMPLOYMENT LABOUR ALLIANCE",
      "total": 55,
      "femaleRatio": 0.509090909090909,
      "wardRatio": 0.6129032258064516,
      "prRatio": 0.375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3157894736842105,
      "top10MedianAge": 44
    },
    {
      "male": 3,
      "female": 15,
      "medianAge": 34.5,
      "party": "DEVELOPMENT OF JOBS IN VRYHEID",
      "total": 18,
      "femaleRatio": 0.8333333333333334,
      "wardRatio": 0,
      "prRatio": 0.8333333333333334,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7,
      "top10MedianAge": 39
    },
    {
      "male": 2,
      "female": 3,
      "medianAge": 51,
      "party": "DISRUPT PARTY",
      "total": 5,
      "femaleRatio": 0.6,
      "wardRatio": 1,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 47
    },
    {
      "male": 10,
      "female": 7,
      "medianAge": 32,
      "party": "SUID - KAAP SAAMSTAAN",
      "total": 17,
      "femaleRatio": 0.4117647058823529,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.42857142857142855,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.42857142857142855,
      "top10MedianAge": 43
    },
    {
      "male": 10,
      "female": 5,
      "medianAge": 49,
      "party": "MOVEMENT FOR TOTAL LIBERATION",
      "total": 15,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0.375,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2857142857142857,
      "top10MedianAge": 55
    },
    {
      "male": 285,
      "female": 202,
      "medianAge": 42,
      "party": "AFRICAN PEOPLE'S MOVEMENT",
      "total": 487,
      "femaleRatio": 0.41478439425051333,
      "wardRatio": 0.3602941176470588,
      "prRatio": 0.4358974358974359,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3939393939393939,
      "top10MedianAge": 76.5
    },
    {
      "male": 9,
      "female": 11,
      "medianAge": 27.5,
      "party": "FUTURE GENERATION CONGRESS",
      "total": 20,
      "femaleRatio": 0.55,
      "wardRatio": 0,
      "prRatio": 0.6111111111111112,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 32
    },
    {
      "male": 26,
      "female": 21,
      "medianAge": 32,
      "party": "AFRICAN PEOPLE FIRST",
      "total": 47,
      "femaleRatio": 0.44680851063829785,
      "wardRatio": 0.4642857142857143,
      "prRatio": 0.42105263157894735,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.42105263157894735,
      "top10MedianAge": 31
    },
    {
      "male": 6,
      "female": 5,
      "medianAge": 24,
      "party": "POELANO REVELATION PARTY",
      "total": 11,
      "femaleRatio": 0.45454545454545453,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 32.5
    },
    {
      "male": 14,
      "female": 9,
      "medianAge": 49,
      "party": "PROGRESSIVE COMMUNITY MOVEMENT",
      "total": 23,
      "femaleRatio": 0.391304347826087,
      "wardRatio": 0.5,
      "prRatio": 0.2727272727272727,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 42.5
    },
    {
      "male": 16,
      "female": 10,
      "medianAge": 52,
      "party": "RANDFONTEIN PEOPLES PARTY",
      "total": 26,
      "femaleRatio": 0.38461538461538464,
      "wardRatio": 0.5454545454545454,
      "prRatio": 0.26666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.26666666666666666,
      "top10MedianAge": 57
    },
    {
      "male": 23,
      "female": 17,
      "medianAge": 49.5,
      "party": "MPUMALANGA PARTY",
      "total": 40,
      "femaleRatio": 0.425,
      "wardRatio": 0.3,
      "prRatio": 0.4666666666666667,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4090909090909091,
      "top10MedianAge": 44.5
    },
    {
      "male": 163,
      "female": 130,
      "medianAge": 39,
      "party": "ABLE LEADERSHIP",
      "total": 293,
      "femaleRatio": 0.44368600682593856,
      "wardRatio": 0.40540540540540543,
      "prRatio": 0.4827586206896552,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.46017699115044247,
      "top10MedianAge": 33
    },
    {
      "male": 26,
      "female": 11,
      "medianAge": 32,
      "party": "SETSOTO SERVICE DELIVERY FORUM",
      "total": 37,
      "femaleRatio": 0.2972972972972973,
      "wardRatio": 0.23076923076923078,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.375,
      "top10MedianAge": 48.5
    },
    {
      "male": 5,
      "female": 1,
      "medianAge": 42,
      "party": "DIKGATLONG SERVICE DELIVERY FORUM",
      "total": 6,
      "femaleRatio": 0.16666666666666666,
      "wardRatio": 0,
      "prRatio": 1,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 1,
      "top10MedianAge": 30
    },
    {
      "male": 10,
      "female": 3,
      "medianAge": 44,
      "party": "DEMOCRATIC PEOPLE'S ALTERNATIVE",
      "total": 13,
      "femaleRatio": 0.23076923076923078,
      "wardRatio": 0,
      "prRatio": 0.3,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 47
    },
    {
      "male": 16,
      "female": 11,
      "medianAge": 41,
      "party": "SOL- PLAATJIE SERVICE DELIVERY FORUM",
      "total": 27,
      "femaleRatio": 0.4074074074074074,
      "wardRatio": 0.4074074074074074,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 16,
      "female": 10,
      "medianAge": 38.5,
      "party": "TIKWANA YOUTH POWER",
      "total": 26,
      "femaleRatio": 0.38461538461538464,
      "wardRatio": 0.6666666666666666,
      "prRatio": 0.3,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.23529411764705882,
      "top10MedianAge": 28
    },
    {
      "male": 5,
      "female": 6,
      "medianAge": 61,
      "party": "ARE AGENG AFRIKA",
      "total": 11,
      "femaleRatio": 0.5454545454545454,
      "wardRatio": 0.5,
      "prRatio": 0.6,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 69
    },
    {
      "male": 15,
      "female": 6,
      "medianAge": 25,
      "party": "MOVEMENT FOR AFRICAN CONVENTION",
      "total": 21,
      "femaleRatio": 0.2857142857142857,
      "wardRatio": 0,
      "prRatio": 0.35294117647058826,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.375,
      "top10MedianAge": 37
    },
    {
      "male": 2,
      "female": 1,
      "medianAge": 30,
      "party": "FREE DEMOCRATS",
      "total": 3,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 30
    },
    {
      "male": 4,
      "female": 2,
      "medianAge": 43,
      "party": "ALLIANCE FOR TRANSFORMATION FOR ALL",
      "total": 6,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 43
    },
    {
      "male": 40,
      "female": 28,
      "medianAge": 42.5,
      "party": "LAND PARTY",
      "total": 68,
      "femaleRatio": 0.4117647058823529,
      "wardRatio": 0.17857142857142858,
      "prRatio": 0.575,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5945945945945946,
      "top10MedianAge": 46
    },
    {
      "male": 7,
      "female": 2,
      "medianAge": 45,
      "party": "ACTIVE MOVEMENT FOR CHANGE",
      "total": 9,
      "femaleRatio": 0.2222222222222222,
      "wardRatio": 0.25,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 42
    },
    {
      "male": 10,
      "female": 9,
      "medianAge": 49,
      "party": "NGWATHE RESIDENTS ASSOCIATION",
      "total": 19,
      "femaleRatio": 0.47368421052631576,
      "wardRatio": 0,
      "prRatio": 0.47368421052631576,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 48.5
    },
    {
      "male": 7,
      "female": 5,
      "medianAge": 50,
      "party": "KAREEBERG CIVIC MOVEMENT",
      "total": 12,
      "femaleRatio": 0.4166666666666667,
      "wardRatio": 0,
      "prRatio": 0.45454545454545453,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.45454545454545453,
      "top10MedianAge": 53
    },
    {
      "male": 6,
      "female": 7,
      "medianAge": 50,
      "party": "BOTSHABELO UNEMPLOYED MOVEMENT",
      "total": 13,
      "femaleRatio": 0.5384615384615384,
      "wardRatio": 0.6363636363636364,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 52
    },
    {
      "male": 11,
      "female": 7,
      "medianAge": 38,
      "party": "CONCERN",
      "total": 18,
      "femaleRatio": 0.3888888888888889,
      "wardRatio": 0,
      "prRatio": 0.3888888888888889,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 45
    },
    {
      "male": 100,
      "female": 48,
      "medianAge": 50.5,
      "party": "BOLSHEVIKS PARTY OF SOUTH AFRICA",
      "total": 148,
      "femaleRatio": 0.32432432432432434,
      "wardRatio": 0.29577464788732394,
      "prRatio": 0.35064935064935066,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.34328358208955223,
      "top10MedianAge": 42
    },
    {
      "male": 2,
      "female": 1,
      "medianAge": 51,
      "party": "SOCIALIST CIVIC MOVEMENT",
      "total": 3,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 51
    },
    {
      "male": 23,
      "female": 11,
      "medianAge": 41,
      "party": "GAZANKULU LIBERATION CONGRESS",
      "total": 34,
      "femaleRatio": 0.3235294117647059,
      "wardRatio": 0.2727272727272727,
      "prRatio": 0.34782608695652173,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3888888888888889,
      "top10MedianAge": 47
    },
    {
      "male": 16,
      "female": 11,
      "medianAge": 46,
      "party": "MANDELA BAY COMMUNITY MOVEMENT",
      "total": 27,
      "femaleRatio": 0.4074074074074074,
      "wardRatio": 1,
      "prRatio": 0.38461538461538464,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 42.5
    },
    {
      "male": 9,
      "female": 21,
      "medianAge": 37,
      "party": "STERKSPRUIT CIVIC ASSOCIATION",
      "total": 30,
      "femaleRatio": 0.7,
      "wardRatio": 0.7692307692307693,
      "prRatio": 0.6470588235294118,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6363636363636364,
      "top10MedianAge": 44
    },
    {
      "male": 6,
      "female": 4,
      "medianAge": 43,
      "party": "RISE UP AFRICA / TSOGA AFRICA",
      "total": 10,
      "femaleRatio": 0.4,
      "wardRatio": 0,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 43
    },
    {
      "male": 8,
      "female": 7,
      "medianAge": 39,
      "party": "UNITED PROGRESSIVE PARTY SOUTH AFRICA",
      "total": 15,
      "femaleRatio": 0.4666666666666667,
      "wardRatio": 0,
      "prRatio": 0.4666666666666667,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 48
    },
    {
      "male": 1,
      "female": 0,
      "medianAge": 56,
      "party": "DRAKENSBERG CONCERNED RESIDENTS",
      "total": 1,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 8,
      "female": 8,
      "medianAge": 46,
      "party": "MINORITY FRONT",
      "total": 16,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5333333333333333,
      "top10MedianAge": 49
    },
    {
      "male": 12,
      "female": 5,
      "medianAge": 42,
      "party": "PROGRESSIVE CHANGE",
      "total": 17,
      "femaleRatio": 0.29411764705882354,
      "wardRatio": 0.4,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 42
    },
    {
      "male": 5,
      "female": 5,
      "medianAge": 40,
      "party": "DIENSLEWERINGS PARTY",
      "total": 10,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 40
    },
    {
      "male": 33,
      "female": 30,
      "medianAge": 50,
      "party": "NORTHERN ALLIANCE",
      "total": 63,
      "femaleRatio": 0.47619047619047616,
      "wardRatio": 0,
      "prRatio": 0.5084745762711864,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 51.5
    },
    {
      "male": 27,
      "female": 8,
      "medianAge": 27,
      "party": "MERAFONG AGENTS OF CHANGE",
      "total": 35,
      "femaleRatio": 0.22857142857142856,
      "wardRatio": 0.19047619047619047,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 37
    },
    {
      "male": 12,
      "female": 3,
      "medianAge": 41,
      "party": "CIVIC VOICE",
      "total": 15,
      "femaleRatio": 0.2,
      "wardRatio": 0.2,
      "prRatio": 0.2,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 51
    },
    {
      "male": 58,
      "female": 32,
      "medianAge": 44.5,
      "party": "AFRICAN INDEPENDENT PEOPLE'S ORGANISATION",
      "total": 90,
      "femaleRatio": 0.35555555555555557,
      "wardRatio": 0.25,
      "prRatio": 0.3939393939393939,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 47
    },
    {
      "male": 673,
      "female": 476,
      "medianAge": 65,
      "party": "NATIONAL FREEDOM PARTY",
      "total": 1149,
      "femaleRatio": 0.4142732811140122,
      "wardRatio": 0.37115839243498816,
      "prRatio": 0.4393939393939394,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.41453831041257366,
      "top10MedianAge": 33
    },
    {
      "male": 1181,
      "female": 257,
      "medianAge": 45.5,
      "party": "INDEPENDENT",
      "total": 1438,
      "femaleRatio": 0.1787204450625869,
      "wardRatio": 0.1787204450625869,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 13,
      "female": 6,
      "medianAge": 39,
      "party": "LIMPOPO RESIDENTS ASSOCIATION",
      "total": 19,
      "femaleRatio": 0.3157894736842105,
      "wardRatio": 0,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.36363636363636365,
      "top10MedianAge": 63
    },
    {
      "male": 3,
      "female": 0,
      "medianAge": 64,
      "party": "FEDERAL PARTY SA",
      "total": 3,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 54
    },
    {
      "male": 22,
      "female": 36,
      "medianAge": 49.5,
      "party": "DEMOCRATIC PEOPLE'S MOVEMENT",
      "total": 58,
      "femaleRatio": 0.6206896551724138,
      "wardRatio": 0.75,
      "prRatio": 0.6,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7,
      "top10MedianAge": 54
    },
    {
      "male": 5,
      "female": 8,
      "medianAge": 33,
      "party": "LEBOWAKGOMO CIVIC ORGANIZATION",
      "total": 13,
      "femaleRatio": 0.6153846153846154,
      "wardRatio": 1,
      "prRatio": 0.5454545454545454,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 41.5
    },
    {
      "male": 17,
      "female": 25,
      "medianAge": 39.5,
      "party": "TEAM SUGAR SOUTH AFRICA",
      "total": 42,
      "femaleRatio": 0.5952380952380952,
      "wardRatio": 0.5714285714285714,
      "prRatio": 0.6,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.43478260869565216,
      "top10MedianAge": 38
    },
    {
      "male": 69,
      "female": 34,
      "medianAge": 42,
      "party": "COMPATRIOTS OF SOUTH AFRICA",
      "total": 103,
      "femaleRatio": 0.3300970873786408,
      "wardRatio": 0.2727272727272727,
      "prRatio": 0.33695652173913043,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3283582089552239,
      "top10MedianAge": 63
    },
    {
      "male": 30,
      "female": 18,
      "medianAge": 40.5,
      "party": "ALTERNATIVE AFRICAN ALLEGIANCE",
      "total": 48,
      "femaleRatio": 0.375,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.38461538461538464,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4666666666666667,
      "top10MedianAge": 58
    },
    {
      "male": 127,
      "female": 49,
      "medianAge": 38.5,
      "party": "ACTIONSA",
      "total": 176,
      "femaleRatio": 0.2784090909090909,
      "wardRatio": 0.203125,
      "prRatio": 0.32142857142857145,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 57.5
    },
    {
      "male": 4,
      "female": 2,
      "medianAge": 48.5,
      "party": "CEDERBERG FIRST RESIDENTS ASSOCIATION",
      "total": 6,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0.5,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 64
    },
    {
      "male": 1,
      "female": 1,
      "medianAge": 31.5,
      "party": "CIVIC MOVEMENT OF SOUTH AFRICA",
      "total": 2,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 31.5
    },
    {
      "male": 5,
      "female": 2,
      "medianAge": 59,
      "party": "COMMUNITY PARTY",
      "total": 7,
      "femaleRatio": 0.2857142857142857,
      "wardRatio": 0,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2857142857142857,
      "top10MedianAge": 59
    },
    {
      "male": 19,
      "female": 5,
      "medianAge": 36,
      "party": "ACTIVE NATION AGAINST CORRUPTION",
      "total": 24,
      "femaleRatio": 0.20833333333333334,
      "wardRatio": 0.3076923076923077,
      "prRatio": 0.09090909090909091,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.09090909090909091,
      "top10MedianAge": 63
    },
    {
      "male": 21,
      "female": 12,
      "medianAge": 36,
      "party": "AZANIA RESIDENT PARTY",
      "total": 33,
      "femaleRatio": 0.36363636363636365,
      "wardRatio": 0.5714285714285714,
      "prRatio": 0.3076923076923077,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.38461538461538464,
      "top10MedianAge": 39
    },
    {
      "male": 7,
      "female": 3,
      "medianAge": 48,
      "party": "PLETT DEMOCRATIC CONGRESS",
      "total": 10,
      "femaleRatio": 0.3,
      "wardRatio": 0,
      "prRatio": 0.3,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 48
    },
    {
      "male": 2,
      "female": 6,
      "medianAge": 45.5,
      "party": "CITIZENS RIGHTS PROTECTION UNITY",
      "total": 8,
      "femaleRatio": 0.75,
      "wardRatio": 0,
      "prRatio": 0.75,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.75,
      "top10MedianAge": 45.5
    },
    {
      "male": 19,
      "female": 7,
      "medianAge": 45.5,
      "party": "AFRICAN SECURITY CONGRESS",
      "total": 26,
      "femaleRatio": 0.2692307692307692,
      "wardRatio": 0,
      "prRatio": 0.2692307692307692,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.22727272727272727,
      "top10MedianAge": 40.5
    },
    {
      "male": 9,
      "female": 5,
      "medianAge": 43,
      "party": "BELABELA COMMUNITY REVOLUTION",
      "total": 14,
      "femaleRatio": 0.35714285714285715,
      "wardRatio": 0.2857142857142857,
      "prRatio": 0.42857142857142855,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.42857142857142855,
      "top10MedianAge": 23
    },
    {
      "male": 8,
      "female": 3,
      "medianAge": 32,
      "party": "SIZWE UMMAH NATION",
      "total": 11,
      "femaleRatio": 0.2727272727272727,
      "wardRatio": 0,
      "prRatio": 0.2727272727272727,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2727272727272727,
      "top10MedianAge": 32
    },
    {
      "male": 17,
      "female": 14,
      "medianAge": 46,
      "party": "ALLIED MOVEMENT FOR CHANGE",
      "total": 31,
      "femaleRatio": 0.45161290322580644,
      "wardRatio": 0.4,
      "prRatio": 0.47619047619047616,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.47058823529411764,
      "top10MedianAge": 34
    },
    {
      "male": 9,
      "female": 7,
      "medianAge": 34,
      "party": "SAYCO GONDWE CIVIC MOVEMENT",
      "total": 16,
      "femaleRatio": 0.4375,
      "wardRatio": 0.5,
      "prRatio": 0.375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.375,
      "top10MedianAge": 35.5
    },
    {
      "male": 13,
      "female": 4,
      "medianAge": 33,
      "party": "UMSOBOMVU RESIDENTS ASSOCIATION",
      "total": 17,
      "femaleRatio": 0.23529411764705882,
      "wardRatio": 0.4,
      "prRatio": 0.16666666666666666,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.16666666666666666,
      "top10MedianAge": 48.5
    },
    {
      "male": 13,
      "female": 7,
      "medianAge": 42.5,
      "party": "THABAZIMBI FORUM FOR SERVICE DELIVERY",
      "total": 20,
      "femaleRatio": 0.35,
      "wardRatio": 0.3,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 28.5
    },
    {
      "male": 72,
      "female": 43,
      "medianAge": 39,
      "party": "PEOPLE'S FREEDOM PARTY",
      "total": 115,
      "femaleRatio": 0.3739130434782609,
      "wardRatio": 0.4411764705882353,
      "prRatio": 0.345679012345679,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.39215686274509803,
      "top10MedianAge": 41
    },
    {
      "male": 20,
      "female": 10,
      "medianAge": 54,
      "party": "AFRICAN HEART CONGRESS",
      "total": 30,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7,
      "top10MedianAge": 46.5
    },
    {
      "male": 42,
      "female": 22,
      "medianAge": 41,
      "party": "COMMUNITY SOLIDARITY ASSOCIATION",
      "total": 64,
      "femaleRatio": 0.34375,
      "wardRatio": 0.26666666666666666,
      "prRatio": 0.4117647058823529,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.35714285714285715,
      "top10MedianAge": 49
    },
    {
      "male": 16,
      "female": 9,
      "medianAge": 49,
      "party": "WESTERN PROVINCE PARTY",
      "total": 25,
      "femaleRatio": 0.36,
      "wardRatio": 0.25,
      "prRatio": 0.38095238095238093,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.38095238095238093,
      "top10MedianAge": 35
    },
    {
      "male": 11,
      "female": 16,
      "medianAge": 27,
      "party": "KHOISAN REVOLUTION",
      "total": 27,
      "femaleRatio": 0.5925925925925926,
      "wardRatio": 0.6666666666666666,
      "prRatio": 0.5833333333333334,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5652173913043478,
      "top10MedianAge": 36
    },
    {
      "male": 5,
      "female": 4,
      "medianAge": 40,
      "party": "KAROO ONTWIKKELINGS PARTY",
      "total": 9,
      "femaleRatio": 0.4444444444444444,
      "wardRatio": 0,
      "prRatio": 0.5714285714285714,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5714285714285714,
      "top10MedianAge": 52
    },
    {
      "male": 11,
      "female": 15,
      "medianAge": 33,
      "party": "IKEMELENG FREE STATE",
      "total": 26,
      "femaleRatio": 0.5769230769230769,
      "wardRatio": 0.5333333333333333,
      "prRatio": 0.6363636363636364,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6363636363636364,
      "top10MedianAge": 38
    },
    {
      "male": 6,
      "female": 6,
      "medianAge": 49,
      "party": "MALETSWAI CIVIC ASSOCIATION",
      "total": 12,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 50.5
    },
    {
      "male": 21,
      "female": 22,
      "medianAge": 43,
      "party": "MORETELE INDEPENDENT CIVIC ORGANIZATION",
      "total": 43,
      "femaleRatio": 0.5116279069767442,
      "wardRatio": 0.5714285714285714,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.47058823529411764,
      "top10MedianAge": 30
    },
    {
      "male": 3,
      "female": 2,
      "medianAge": 58,
      "party": "KAAP AGULHAS CIVIC ORGANISASIE",
      "total": 5,
      "femaleRatio": 0.4,
      "wardRatio": 0,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 58
    },
    {
      "male": 23,
      "female": 9,
      "medianAge": 46.5,
      "party": "KNOW YOUR NEIGHBOUR",
      "total": 32,
      "femaleRatio": 0.28125,
      "wardRatio": 0.125,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3157894736842105,
      "top10MedianAge": 23
    },
    {
      "male": 31,
      "female": 22,
      "medianAge": 65,
      "party": "DISABILITY AND OLDER PERSON POLITICAL PARTY",
      "total": 53,
      "femaleRatio": 0.41509433962264153,
      "wardRatio": 0.3076923076923077,
      "prRatio": 0.45,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 49
    },
    {
      "male": 1,
      "female": 0,
      "medianAge": 37,
      "party": "KNYSNA SOCIAL DEMOCRATIC PARTY",
      "total": 1,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 3,
      "female": 4,
      "medianAge": 35,
      "party": "SOUTH AFRICAN SECURITY ORGANISATION",
      "total": 7,
      "femaleRatio": 0.5714285714285714,
      "wardRatio": 0,
      "prRatio": 0.5714285714285714,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5714285714285714,
      "top10MedianAge": 35
    },
    {
      "male": 80,
      "female": 112,
      "medianAge": 42.5,
      "party": "JUSTICE AND EMPLOYMENT PARTY",
      "total": 192,
      "femaleRatio": 0.5833333333333334,
      "wardRatio": 0.6024096385542169,
      "prRatio": 0.5688073394495413,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5416666666666666,
      "top10MedianAge": 30
    },
    {
      "male": 16,
      "female": 24,
      "medianAge": 49,
      "party": "PROGRESSIVE FRONT OF SOUTH AFRICA",
      "total": 40,
      "femaleRatio": 0.6,
      "wardRatio": 0.7272727272727273,
      "prRatio": 0.5517241379310345,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4375,
      "top10MedianAge": 51.5
    },
    {
      "male": 1,
      "female": 0,
      "medianAge": 61,
      "party": "KONSERWATIEWE PARTY/CONSERVATIVE PARTY",
      "total": 1,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 61
    },
    {
      "male": 29,
      "female": 19,
      "medianAge": 38.5,
      "party": "NAMAKWA CIVIC MOVEMENT",
      "total": 48,
      "femaleRatio": 0.3958333333333333,
      "wardRatio": 0.35294117647058826,
      "prRatio": 0.41935483870967744,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.41935483870967744,
      "top10MedianAge": 60
    },
    {
      "male": 6,
      "female": 1,
      "medianAge": 34,
      "party": "EASTERN CAPE MOVEMENT",
      "total": 7,
      "femaleRatio": 0.14285714285714285,
      "wardRatio": 0,
      "prRatio": 0.2,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2,
      "top10MedianAge": 28
    },
    {
      "male": 13,
      "female": 6,
      "medianAge": 44,
      "party": "DEVOTED CITIZENS OF MSUNDUZI",
      "total": 19,
      "femaleRatio": 0.3157894736842105,
      "wardRatio": 0,
      "prRatio": 0.375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.36363636363636365,
      "top10MedianAge": 48
    },
    {
      "male": 2,
      "female": 0,
      "medianAge": 40,
      "party": "FRANCES BAARD DISTRICT FORUM",
      "total": 2,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 40
    },
    {
      "male": 38,
      "female": 49,
      "medianAge": 44,
      "party": "SOCIALIST PARTY OF SOUTH AFRICA",
      "total": 87,
      "femaleRatio": 0.5632183908045977,
      "wardRatio": 0.52,
      "prRatio": 0.5806451612903226,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5116279069767442,
      "top10MedianAge": 23
    },
    {
      "male": 33,
      "female": 50,
      "medianAge": 27,
      "party": "AFRICAN CONTENT MOVEMENT",
      "total": 83,
      "femaleRatio": 0.6024096385542169,
      "wardRatio": 0.5757575757575758,
      "prRatio": 0.62,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 36.5
    },
    {
      "male": 6,
      "female": 5,
      "medianAge": 36,
      "party": "HESSEQUA PEOPLES MOVEMENT",
      "total": 11,
      "femaleRatio": 0.45454545454545453,
      "wardRatio": 0.4,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 35.5
    },
    {
      "male": 4837,
      "female": 4254,
      "medianAge": 38,
      "party": "AFRICAN NATIONAL CONGRESS",
      "total": 9091,
      "femaleRatio": 0.46793532064679355,
      "wardRatio": 0.30783669638667294,
      "prRatio": 0.6092358666390557,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6259982253771074,
      "top10MedianAge": 45
    },
    {
      "male": 9,
      "female": 3,
      "medianAge": 35,
      "party": "AFRICAN ECONOMIC TRANSFORMERS",
      "total": 12,
      "femaleRatio": 0.25,
      "wardRatio": 0.5,
      "prRatio": 0.125,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.125,
      "top10MedianAge": 55
    },
    {
      "male": 23,
      "female": 15,
      "medianAge": 40.5,
      "party": "MINORITIES OF SOUTH AFRICA",
      "total": 38,
      "femaleRatio": 0.39473684210526316,
      "wardRatio": 1,
      "prRatio": 0.3783783783783784,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 59.5
    },
    {
      "male": 2,
      "female": 2,
      "medianAge": 49,
      "party": "KANNALAND INDEPENDENT PARTY",
      "total": 4,
      "femaleRatio": 0.5,
      "wardRatio": 0.6666666666666666,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 47
    },
    {
      "male": 4,
      "female": 7,
      "medianAge": 55,
      "party": "SOUTH AFRICAN RELIGIOUS CIVIC ORGANISATION",
      "total": 11,
      "femaleRatio": 0.6363636363636364,
      "wardRatio": 0,
      "prRatio": 0.6363636363636364,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 52
    },
    {
      "male": 6,
      "female": 4,
      "medianAge": 46.5,
      "party": "EDEN UNITED PEOPLE'S PARTY",
      "total": 10,
      "femaleRatio": 0.4,
      "wardRatio": 0.5,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 59.5
    },
    {
      "male": 42,
      "female": 22,
      "medianAge": 40.5,
      "party": "ACTIVE CITIZENS COALITION",
      "total": 64,
      "femaleRatio": 0.34375,
      "wardRatio": 0.375,
      "prRatio": 0.3392857142857143,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 45
    },
    {
      "male": 7,
      "female": 3,
      "medianAge": 45,
      "party": "INDEPENDENT RATEPAYERS ASSOCIATION OF SA",
      "total": 10,
      "femaleRatio": 0.3,
      "wardRatio": 0,
      "prRatio": 0.3,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 45
    },
    {
      "male": 17,
      "female": 9,
      "medianAge": 44.5,
      "party": "FORUM FOR DEMOCRATS",
      "total": 26,
      "femaleRatio": 0.34615384615384615,
      "wardRatio": 0,
      "prRatio": 0.375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.36363636363636365,
      "top10MedianAge": 44.5
    },
    {
      "male": 3,
      "female": 4,
      "medianAge": 43,
      "party": "KATEKANI ECONOMIC POWER",
      "total": 7,
      "femaleRatio": 0.5714285714285714,
      "wardRatio": 0,
      "prRatio": 0.5714285714285714,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5714285714285714,
      "top10MedianAge": 43
    },
    {
      "male": 60,
      "female": 41,
      "medianAge": 27,
      "party": "SOCIALIST AGENDA OF DISPOSSESSED AFRICANS",
      "total": 101,
      "femaleRatio": 0.40594059405940597,
      "wardRatio": 0.4782608695652174,
      "prRatio": 0.38461538461538464,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.30303030303030304,
      "top10MedianAge": 28
    },
    {
      "male": 19,
      "female": 35,
      "medianAge": 48,
      "party": "THE ORGANIC HUMANITY MOVEMENT",
      "total": 54,
      "femaleRatio": 0.6481481481481481,
      "wardRatio": 0,
      "prRatio": 0.6481481481481481,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.660377358490566,
      "top10MedianAge": 43
    },
    {
      "male": 6,
      "female": 9,
      "medianAge": 44,
      "party": "BOTHO COMMUNITY MOVEMENT",
      "total": 15,
      "femaleRatio": 0.6,
      "wardRatio": 0.5,
      "prRatio": 0.6363636363636364,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 31.5
    },
    {
      "male": 3,
      "female": 1,
      "medianAge": 47,
      "party": "KHOWA RESIDENTS ASSOCIATION",
      "total": 4,
      "femaleRatio": 0.25,
      "wardRatio": 0.5,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 51
    },
    {
      "male": 125,
      "female": 97,
      "medianAge": 37,
      "party": "AFRICAN FREEDOM REVOLUTION",
      "total": 222,
      "femaleRatio": 0.4369369369369369,
      "wardRatio": 0.41836734693877553,
      "prRatio": 0.45161290322580644,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4431818181818182,
      "top10MedianAge": 40
    },
    {
      "male": 457,
      "female": 425,
      "medianAge": 43.5,
      "party": "UNITED DEMOCRATIC MOVEMENT",
      "total": 882,
      "femaleRatio": 0.481859410430839,
      "wardRatio": 0.5,
      "prRatio": 0.47419354838709676,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.44221105527638194,
      "top10MedianAge": 44
    },
    {
      "male": 3,
      "female": 1,
      "medianAge": 56,
      "party": "CHRISTIAN AMBASSADORS POLITICAL PARTY",
      "total": 4,
      "femaleRatio": 0.25,
      "wardRatio": 0.5,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 45
    },
    {
      "male": 613,
      "female": 254,
      "medianAge": 79,
      "party": "VRYHEIDSFRONT PLUS",
      "total": 867,
      "femaleRatio": 0.29296424452133796,
      "wardRatio": 0.3142857142857143,
      "prRatio": 0.2920673076923077,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.29608938547486036,
      "top10MedianAge": 46
    },
    {
      "male": 13,
      "female": 1,
      "medianAge": 37.5,
      "party": "AGENDA TO CITIZENRY GOVERNORS",
      "total": 14,
      "femaleRatio": 0.07142857142857142,
      "wardRatio": 0,
      "prRatio": 0.14285714285714285,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.14285714285714285,
      "top10MedianAge": 29
    },
    {
      "male": 27,
      "female": 15,
      "medianAge": 43.5,
      "party": "INDEPENDENT ALLIANCE",
      "total": 42,
      "femaleRatio": 0.35714285714285715,
      "wardRatio": 0.1,
      "prRatio": 0.4375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.45,
      "top10MedianAge": 42
    },
    {
      "male": 6,
      "female": 10,
      "medianAge": 35.5,
      "party": "SAKHISIZWE PROGRESSIVE MOVEMENT",
      "total": 16,
      "femaleRatio": 0.625,
      "wardRatio": 0,
      "prRatio": 0.625,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7,
      "top10MedianAge": 48.5
    },
    {
      "male": 6,
      "female": 2,
      "medianAge": 26,
      "party": "YOUNG PEOPLES PARTY",
      "total": 8,
      "femaleRatio": 0.25,
      "wardRatio": 0,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 26
    },
    {
      "male": 300,
      "female": 384,
      "medianAge": 56.5,
      "party": "AFRICAN INDEPENDENT CONGRESS",
      "total": 684,
      "femaleRatio": 0.5614035087719298,
      "wardRatio": 0.558282208588957,
      "prRatio": 0.5623800383877159,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5884057971014492,
      "top10MedianAge": 28
    },
    {
      "male": 11,
      "female": 7,
      "medianAge": 41.5,
      "party": "MAKANA CITIZENS FRONT",
      "total": 18,
      "femaleRatio": 0.3888888888888889,
      "wardRatio": 0.45454545454545453,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2857142857142857,
      "top10MedianAge": 58
    },
    {
      "male": 17,
      "female": 11,
      "medianAge": 44.5,
      "party": "BUSHBUCKRIDGE LOCALS MOVEMENT",
      "total": 28,
      "femaleRatio": 0.39285714285714285,
      "wardRatio": 0.4074074074074074,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 44
    },
    {
      "male": 10,
      "female": 11,
      "medianAge": 28,
      "party": "HOPE FOR THE FUTURE",
      "total": 21,
      "femaleRatio": 0.5238095238095238,
      "wardRatio": 0.3,
      "prRatio": 0.7272727272727273,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7272727272727273,
      "top10MedianAge": 45
    },
    {
      "male": 278,
      "female": 164,
      "medianAge": 49.5,
      "party": "FORUM 4 SERVICE DELIVERY",
      "total": 442,
      "femaleRatio": 0.37104072398190047,
      "wardRatio": 0.38860103626943004,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 44.5
    },
    {
      "male": 7,
      "female": 5,
      "medianAge": 39,
      "party": "DEMOCRATIC ASSOCIATION OF WITZENBERG INDEPENDENCE",
      "total": 12,
      "femaleRatio": 0.4166666666666667,
      "wardRatio": 0.5555555555555556,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 48
    },
    {
      "male": 1,
      "female": 0,
      "medianAge": 69,
      "party": "ZULU ROYAL PROPERTY",
      "total": 1,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 49,
      "female": 70,
      "medianAge": 43,
      "party": "BATHO PELE MOVEMENT",
      "total": 119,
      "femaleRatio": 0.5882352941176471,
      "wardRatio": 0.8235294117647058,
      "prRatio": 0.5490196078431373,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.527027027027027,
      "top10MedianAge": 41
    },
    {
      "male": 28,
      "female": 14,
      "medianAge": 39,
      "party": "ANSWER FOR COMMUNITY",
      "total": 42,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0.4666666666666667,
      "prRatio": 0.25925925925925924,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.1,
      "top10MedianAge": 54.5
    },
    {
      "male": 210,
      "female": 155,
      "medianAge": 63,
      "party": "INTERNATIONAL REVELATION CONGRESS",
      "total": 365,
      "femaleRatio": 0.4246575342465753,
      "wardRatio": 0.3465909090909091,
      "prRatio": 0.4973544973544973,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 40.5
    },
    {
      "male": 14,
      "female": 19,
      "medianAge": 35,
      "party": "INDEPENDENTS FOR COMMUNITIES",
      "total": 33,
      "femaleRatio": 0.5757575757575758,
      "wardRatio": 0.4,
      "prRatio": 0.6071428571428571,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 46
    },
    {
      "male": 32,
      "female": 29,
      "medianAge": 26,
      "party": "PLAASLIKE BESORGDE INWONERS",
      "total": 61,
      "femaleRatio": 0.47540983606557374,
      "wardRatio": 0.5,
      "prRatio": 0.4727272727272727,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5526315789473685,
      "top10MedianAge": 56.5
    },
    {
      "male": 19,
      "female": 18,
      "medianAge": 61,
      "party": "MOQHAKA COMMUNITY FORUM",
      "total": 37,
      "femaleRatio": 0.4864864864864865,
      "wardRatio": 0.5714285714285714,
      "prRatio": 0.375,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 49.5
    },
    {
      "male": 5,
      "female": 5,
      "medianAge": 62.5,
      "party": "NATIONAL RELIGIOUS FREEDOM PARTY",
      "total": 10,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5555555555555556,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5555555555555556,
      "top10MedianAge": 63
    },
    {
      "male": 9,
      "female": 16,
      "medianAge": 32,
      "party": "YOUTH INDEPENDENCE PARTY AND YOUTH ASSOCIATES",
      "total": 25,
      "femaleRatio": 0.64,
      "wardRatio": 0.8571428571428571,
      "prRatio": 0.5555555555555556,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5882352941176471,
      "top10MedianAge": 35
    },
    {
      "male": 13,
      "female": 7,
      "medianAge": 33.5,
      "party": "THE INDEPENDENTS",
      "total": 20,
      "femaleRatio": 0.35,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.35294117647058826,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 42
    },
    {
      "male": 2,
      "female": 2,
      "medianAge": 35.5,
      "party": "DEMOCRATIC FREEDOM ALLIANCE",
      "total": 4,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 35.5
    },
    {
      "male": 4,
      "female": 8,
      "medianAge": 54.5,
      "party": "ABAHLALY BAAHI",
      "total": 12,
      "femaleRatio": 0.6666666666666666,
      "wardRatio": 1,
      "prRatio": 0.6363636363636364,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 48
    },
    {
      "male": 20,
      "female": 45,
      "medianAge": 41,
      "party": "AFRICAN PEOPLE'S SOCIALIST PARTY",
      "total": 65,
      "femaleRatio": 0.6923076923076923,
      "wardRatio": 1,
      "prRatio": 0.6825396825396826,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6111111111111112,
      "top10MedianAge": 44.5
    },
    {
      "male": 96,
      "female": 42,
      "medianAge": 66,
      "party": "CAPE INDEPENDENCE PARTY / KAAPSE ONAFHANKLIKHEIDS PARTY",
      "total": 138,
      "femaleRatio": 0.30434782608695654,
      "wardRatio": 0.3220338983050847,
      "prRatio": 0.2911392405063291,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2911392405063291,
      "top10MedianAge": 47
    },
    {
      "male": 19,
      "female": 9,
      "medianAge": 41.5,
      "party": "AFRICAN UNIFIED MOVEMENT",
      "total": 28,
      "femaleRatio": 0.32142857142857145,
      "wardRatio": 0.3,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 40.5
    },
    {
      "male": 13,
      "female": 16,
      "medianAge": 24,
      "party": "LEIHLO LA SETJHABA RAINBOW",
      "total": 29,
      "femaleRatio": 0.5517241379310345,
      "wardRatio": 0.5,
      "prRatio": 0.56,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6111111111111112,
      "top10MedianAge": 44.5
    },
    {
      "male": 0,
      "female": 1,
      "medianAge": 45,
      "party": "HUMAN DIGNITY RESTORATION",
      "total": 1,
      "femaleRatio": 1,
      "wardRatio": 1,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 15,
      "female": 3,
      "medianAge": 58.5,
      "party": "MTHATHA RATEPAYERS AND RESIDENTS ASSOCIATION",
      "total": 18,
      "femaleRatio": 0.16666666666666666,
      "wardRatio": 0,
      "prRatio": 0.17647058823529413,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.1,
      "top10MedianAge": 50
    },
    {
      "male": 13,
      "female": 18,
      "medianAge": 44,
      "party": "NATIONAL COMMUNIST CONGRESS",
      "total": 31,
      "femaleRatio": 0.5806451612903226,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.6071428571428571,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5833333333333334,
      "top10MedianAge": 54
    },
    {
      "male": 36,
      "female": 41,
      "medianAge": 29,
      "party": "AFRICAN MULTICULTURAL ECONOMIC CONGRESS",
      "total": 77,
      "femaleRatio": 0.5324675324675324,
      "wardRatio": 0.5652173913043478,
      "prRatio": 0.5185185185185185,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6153846153846154,
      "top10MedianAge": 26.5
    },
    {
      "male": 35,
      "female": 62,
      "medianAge": 50,
      "party": "THE PEOPLE'S VOICE",
      "total": 97,
      "femaleRatio": 0.6391752577319587,
      "wardRatio": 1,
      "prRatio": 0.631578947368421,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5238095238095238,
      "top10MedianAge": 43
    },
    {
      "male": 50,
      "female": 42,
      "medianAge": 54,
      "party": "AFRICAN DEMOCRATIC CHANGE",
      "total": 92,
      "femaleRatio": 0.45652173913043476,
      "wardRatio": 0.75,
      "prRatio": 0.4431818181818182,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.42857142857142855,
      "top10MedianAge": 51
    },
    {
      "male": 34,
      "female": 14,
      "medianAge": 39,
      "party": "NATIONAL INDEPENDENT PARTY",
      "total": 48,
      "femaleRatio": 0.2916666666666667,
      "wardRatio": 0.25,
      "prRatio": 0.3125,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25,
      "top10MedianAge": 54
    },
    {
      "male": 14,
      "female": 14,
      "medianAge": 39.5,
      "party": "ONE MOVEMENT FOR CAPE TOWN",
      "total": 28,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5185185185185185,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 59
    },
    {
      "male": 20,
      "female": 8,
      "medianAge": 45,
      "party": "CREDIBLE ALTERNATIVE 1ST MOVEMENT",
      "total": 28,
      "femaleRatio": 0.2857142857142857,
      "wardRatio": 0,
      "prRatio": 0.2857142857142857,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 61
    },
    {
      "male": 9,
      "female": 4,
      "medianAge": 58,
      "party": "SERVICE FOR ALL",
      "total": 13,
      "femaleRatio": 0.3076923076923077,
      "wardRatio": 0.2857142857142857,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3333333333333333,
      "top10MedianAge": 39
    },
    {
      "male": 7,
      "female": 8,
      "medianAge": 26,
      "party": "AFRICAN VOICE",
      "total": 15,
      "femaleRatio": 0.5333333333333333,
      "wardRatio": 0.2,
      "prRatio": 0.7,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7,
      "top10MedianAge": 32.5
    },
    {
      "male": 53,
      "female": 20,
      "medianAge": 39,
      "party": "NEW HORIZON MOVEMENT",
      "total": 73,
      "femaleRatio": 0.273972602739726,
      "wardRatio": 0.24242424242424243,
      "prRatio": 0.3,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.35,
      "top10MedianAge": 42.5
    },
    {
      "male": 8,
      "female": 4,
      "medianAge": 60,
      "party": "UNITED COMMUNITY FRONT",
      "total": 12,
      "femaleRatio": 0.3333333333333333,
      "wardRatio": 0,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.3,
      "top10MedianAge": 56.5
    },
    {
      "male": 15,
      "female": 21,
      "medianAge": 49,
      "party": "UNITED SOUTH AFRICA",
      "total": 36,
      "femaleRatio": 0.5833333333333334,
      "wardRatio": 0.5,
      "prRatio": 0.5882352941176471,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 60
    },
    {
      "male": 19,
      "female": 9,
      "medianAge": 41,
      "party": "MOGALAKWENA RESIDENTS ASSOCIATION",
      "total": 28,
      "femaleRatio": 0.32142857142857145,
      "wardRatio": 0.3,
      "prRatio": 0.3333333333333333,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4,
      "top10MedianAge": 43.5
    },
    {
      "male": 222,
      "female": 171,
      "medianAge": 25,
      "party": "BLACK FIRST LAND FIRST",
      "total": 393,
      "femaleRatio": 0.4351145038167939,
      "wardRatio": 0.43902439024390244,
      "prRatio": 0.43333333333333335,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.43537414965986393,
      "top10MedianAge": 43
    },
    {
      "male": 19,
      "female": 10,
      "medianAge": 64,
      "party": "ARONA",
      "total": 29,
      "femaleRatio": 0.3448275862068966,
      "wardRatio": 0,
      "prRatio": 0.35714285714285715,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.18181818181818182,
      "top10MedianAge": 30
    },
    {
      "male": 19,
      "female": 21,
      "medianAge": 52.5,
      "party": "THE GREENS",
      "total": 40,
      "femaleRatio": 0.525,
      "wardRatio": 0.5277777777777778,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 45.5
    },
    {
      "male": 2082,
      "female": 2114,
      "medianAge": 40.5,
      "party": "AFRICAN TRANSFORMATION MOVEMENT",
      "total": 4196,
      "femaleRatio": 0.503813155386082,
      "wardRatio": 0.4550819672131148,
      "prRatio": 0.5316360913515538,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5184349134687735,
      "top10MedianAge": 44
    },
    {
      "male": 9,
      "female": 1,
      "medianAge": 48.5,
      "party": "WITZENBERG ONAFHANKLIKE DEMOKRATIESE PARTY",
      "total": 10,
      "femaleRatio": 0.1,
      "wardRatio": 0,
      "prRatio": 0.14285714285714285,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.14285714285714285,
      "top10MedianAge": 55
    },
    {
      "male": 12,
      "female": 16,
      "medianAge": 31.5,
      "party": "SOUTH AFRICAN UNITED NATIONAL DEMOCRATIC FRONT",
      "total": 28,
      "femaleRatio": 0.5714285714285714,
      "wardRatio": 0.5625,
      "prRatio": 0.5833333333333334,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 52.5
    },
    {
      "male": 563,
      "female": 236,
      "medianAge": 54,
      "party": "PAN AFRICANIST CONGRESS OF AZANIA",
      "total": 799,
      "femaleRatio": 0.295369211514393,
      "wardRatio": 0.2953020134228188,
      "prRatio": 0.2954091816367265,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.29518072289156627,
      "top10MedianAge": 52.5
    },
    {
      "male": 3,
      "female": 3,
      "medianAge": 49,
      "party": "WITZENBERG PARTY",
      "total": 6,
      "femaleRatio": 0.5,
      "wardRatio": 0,
      "prRatio": 0.5,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5,
      "top10MedianAge": 49
    },
    {
      "male": 24,
      "female": 14,
      "medianAge": 48,
      "party": "DEMOCRATIC UNION PLUS",
      "total": 38,
      "femaleRatio": 0.3684210526315789,
      "wardRatio": 0.3076923076923077,
      "prRatio": 0.4,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.391304347826087,
      "top10MedianAge": 36
    },
    {
      "male": 42,
      "female": 28,
      "medianAge": 36.5,
      "party": "KZN INDEPENDENCE",
      "total": 70,
      "femaleRatio": 0.4,
      "wardRatio": 0.3939393939393939,
      "prRatio": 0.40540540540540543,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.375,
      "top10MedianAge": 42
    },
    {
      "male": 20,
      "female": 12,
      "medianAge": 42,
      "party": "COMMUNITY FREEDOM PARTY",
      "total": 32,
      "femaleRatio": 0.375,
      "wardRatio": 0,
      "prRatio": 0.5217391304347826,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.5294117647058824,
      "top10MedianAge": 43
    },
    {
      "male": 9,
      "female": 7,
      "medianAge": 41.5,
      "party": "INDEPENDENT CIVIC MOVEMENT",
      "total": 16,
      "femaleRatio": 0.4375,
      "wardRatio": 0,
      "prRatio": 0.4666666666666667,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4444444444444444,
      "top10MedianAge": 45
    },
    {
      "male": 3,
      "female": 2,
      "medianAge": 33,
      "party": "KHOI-SAN KINGDOM OF RSA",
      "total": 5,
      "femaleRatio": 0.4,
      "wardRatio": 0.4,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 11,
      "female": 3,
      "medianAge": 51,
      "party": "AFRICAN PROGRESSIVE MOVEMENT",
      "total": 14,
      "femaleRatio": 0.21428571428571427,
      "wardRatio": 0.3333333333333333,
      "prRatio": 0.125,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.125,
      "top10MedianAge": 46
    },
    {
      "male": 23,
      "female": 24,
      "medianAge": 36,
      "party": "UNITED RESIDENTS FRONT",
      "total": 47,
      "femaleRatio": 0.5106382978723404,
      "wardRatio": 0.5625,
      "prRatio": 0.4838709677419355,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.7142857142857143,
      "top10MedianAge": 31.5
    },
    {
      "male": 25,
      "female": 8,
      "medianAge": 51,
      "party": "ABAHLALI BASE MKHANYAKUDE MOVEMENT",
      "total": 33,
      "femaleRatio": 0.24242424242424243,
      "wardRatio": 0.2,
      "prRatio": 0.2608695652173913,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.2727272727272727,
      "top10MedianAge": 49
    },
    {
      "male": 25,
      "female": 34,
      "medianAge": 42,
      "party": "AZANIAN INDEPENDENT COMMUNITY MOVEMENT",
      "total": 59,
      "femaleRatio": 0.576271186440678,
      "wardRatio": 0.6785714285714286,
      "prRatio": 0.4838709677419355,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4642857142857143,
      "top10MedianAge": 43
    },
    {
      "male": 2,
      "female": 0,
      "medianAge": 63,
      "party": "DEMOCRATIC EQUALITY EMPOWERMENT PARTY",
      "total": 2,
      "femaleRatio": 0,
      "wardRatio": 0,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 0,
      "female": 1,
      "medianAge": 35,
      "party": "BLACK AND WHITE PARTY",
      "total": 1,
      "femaleRatio": 1,
      "wardRatio": 0,
      "prRatio": 1,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 1,
      "top10MedianAge": 35
    },
    {
      "male": 3,
      "female": 14,
      "medianAge": 62,
      "party": "AGANG SOUTH AFRICA",
      "total": 17,
      "femaleRatio": 0.8235294117647058,
      "wardRatio": 0,
      "prRatio": 0.8235294117647058,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.8235294117647058,
      "top10MedianAge": 62
    },
    {
      "male": 0,
      "female": 1,
      "medianAge": 55,
      "party": "KHOISAN KINGDOM AND ALL PEOPLE",
      "total": 1,
      "femaleRatio": 1,
      "wardRatio": 1,
      "prRatio": 0,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0,
      "top10MedianAge": 0
    },
    {
      "male": 25,
      "female": 8,
      "medianAge": 43,
      "party": "KAROO DEMOCRATIC FORCE",
      "total": 33,
      "femaleRatio": 0.24242424242424243,
      "wardRatio": 0.2,
      "prRatio": 0.25,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.25925925925925924,
      "top10MedianAge": 53
    },
    {
      "male": 22,
      "female": 6,
      "medianAge": 70.5,
      "party": "HIS LORDSHIP TO SAVE AND LEAD PARTY",
      "total": 28,
      "femaleRatio": 0.21428571428571427,
      "wardRatio": 0.14285714285714285,
      "prRatio": 0.23809523809523808,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.1,
      "top10MedianAge": 55.5
    },
    {
      "male": 16,
      "female": 20,
      "medianAge": 53.5,
      "party": "AMALGAMATED RAINBOW MOVEMENT",
      "total": 36,
      "femaleRatio": 0.5555555555555556,
      "wardRatio": 0,
      "prRatio": 0.5555555555555556,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.6,
      "top10MedianAge": 120
    },
    {
      "male": 41,
      "female": 36,
      "medianAge": 55,
      "party": "BETTER RESIDENTS ASSOCIATION",
      "total": 77,
      "femaleRatio": 0.4675324675324675,
      "wardRatio": 0.42857142857142855,
      "prRatio": 0.47619047619047616,
      "top10Male": 5,
      "top10Female": 5,
      "top10FemaleRatio": 0.4857142857142857,
      "top10MedianAge": 55
    }
  ];


  var margin = {top: 19.5, right: 19.5, bottom: 80.5, left: 70},
      width = 960 - margin.right,
      height = 500 - margin.top - margin.bottom;
  var minAge = 30, maxAge = 60;
  var minRadius = 50, maxRadius = 10000;
  var transitionDuration = 2000;

  var xScale = linear$1().domain([minAge, maxAge]).range([0, width]).nice(),
      yScale = linear$1().domain([1, 0]).range([0, height]).nice(),
      colorScale = category20,
      radiusScale = linear$1().domain([minRadius, maxRadius]).range([0, 40]),
      xAxis = axisBottom(xScale).ticks(12, ",d"),
      yAxis = axisLeft(yScale);

  var container = select("#chart");

  var svg = container.append("svg")
      .attr("viewBox", "0 0 " + (width * 1.2) + " " + (height * 1.2) )
      .attr("preserveAspectRatio", "xMidYMid meet");

  svg.append("defs")
      .append("marker")
          .attr("id", "arrow-head")
          .attr("markerWidth", "13")
          .attr("markerHeight", "13")
          .attr("refx", "5")
          .attr("refy", "5")
          .attr("orient", "auto")
          .append("path")
              .attr("d", "M0,0 L0,10 L10,5 L0,0");
      
  svg = svg.append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var position = function(dot) {
      dot
        .attr("cx", function(d) { return xScale(d.medianAge); })
        .attr("cy", function(d) { return yScale(d.femaleRatio); })
        .attr("r", function(d) { return radiusScale(d.total); });
  };

  var position10 = function(dot) {
      selectAll(".info-text").style("display", "none");
      selectAll(".info-line").style("display", "none");
      dot
        .attr("cx", function(d) { return xScale(d.top10MedianAge); })
        .attr("cy", function(d) { return yScale(d.top10FemaleRatio); })
        .attr("r", function(d) { return radiusScale(d.total); });
  };

  var position_ward = function(dot) {
      selectAll(".info-text").style("display", "none");
      selectAll(".info-line").style("display", "none");
      dot
        .attr("cx", function(d) { return xScale(d.medianAge); })
        .attr("cy", function(d) { return yScale(d.wardRatio); })
        .attr("r", function(d) { return radiusScale(d.total); });
  };

  var position_pr = function(dot) {
      selectAll(".info-text").style("display", "none");
      selectAll(".info-line").style("display", "none");
      dot
        .attr("cx", function(d) { return xScale(d.medianAge); })
        .attr("cy", function(d) { return yScale(d.prRatio); })
        .attr("r", function(d) { return radiusScale(d.total); });
  };

  var tooltip = container.append("div")
      .attr("id", "tooltip");
  tooltip.append("p").attr("class", "party-name");
  tooltip.append("h3").text("All Candidates");
  tooltip.append("p").attr("class", "candidates");
  tooltip.append("p").attr("class", "women");
  tooltip.append("p").attr("class", "men");
  tooltip.append("p").attr("class", "median-age");
  tooltip.append("h3").text("Top 10 Candidates");
  tooltip.append("p").attr("class", "women-top10");
  tooltip.append("p").attr("class", "men-top10");
  tooltip.append("p").attr("class", "median-age-top10");

  svg.selectAll("circle").data(parties).enter()
      .append("circle")
          .classed("dot", true)
          .style("fill", function(d, idx) {
              if (d.party in party_colors)
                  return party_colors[d.party]
              return colorScale[idx % 20]
          })
          .call(position)
          .on("mousemove", function() {
              var el = this.__data__;
              var tooltip = select("#tooltip")
                  .style("top", (event.layerY - 16) + "px")
                  .style("left", (event.layerX + 16) + "px")
                  .style("display", "block")
                  .style("position", "absolute");
              tooltip.select(".party-name").text(el.party);
              tooltip.select(".candidates").text("Total candidates: " + el.total);
              tooltip.select(".men").text("Men: " + el.male);
              tooltip.select(".women").text("Women: " + el.female);
              tooltip.select(".median-age").text("Median Age: " + el.medianAge + " years");
              tooltip.select(".women-top10").text("Women: " + el.top10Female);

              tooltip.select(".men-top10").text("Men: " + el.top10Male);
              tooltip.select(".median-age-top10").text("Median age: " + el.top10MedianAge + " years");
          })
          .on("mouseout", function() {
              select("#tooltip").style("display", "none");
          });

  svg.append("rect")
      .style("fill", "white")
      .attr("x", xScale(minAge))
      .attr("y", yScale(0))
      .attr("width", xScale(maxAge))
      .attr("height", maxRadius);

  svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);

  svg.append("g")
      .attr("class", "y axis")
      .call(yAxis);

  svg.append("line")
      .classed("gender-equality", true)
      .attr("x1", xScale(minAge))
      .attr("x2", xScale(maxAge))
      .attr("y1", yScale(0.5))
      .attr("y2", yScale(0.5));

  svg.append("text")
      .classed("gender-equality-text", true)
      .text("Gender equality line")
      .attr("transform", "translate(" + xScale(31) + "," + yScale(0.51) + ")");

  svg.append("path")
      .attr("d", "M0,0")
      .attr("transform", "translate(" + xScale(59.7) + "," + yScale(0.038) + ")")
      .attr("style", "marker-end:url(#arrow-head);");

  svg.append("text")
      .attr("class", "x axis-label")
      .attr("text-anchor", "end")
      .attr("x", xScale(59.5))
      .attr("y", yScale(0.015))
      .text("Older candidates")
      .classed("x-axis-label", true);


  svg.append("path")
      .attr("d", "M0,0")
      .attr("transform", "translate(" + xScale(30.5) + "," + yScale(0.015) + ") rotate(180)")
      .attr("style", "marker-end:url(#arrow-head);");

  var party_da = svg.append("g");
  party_da.append("path")
      .attr("d", "M670,220 L700,190")
      .classed("info-line", true);

  party_da.append("g")
      .attr("transform", "translate(650,180)")
      .append("text")
          .text("Democratic Alliance")
          .classed("info-text", true);

  var party_anc = svg.append("g");
  party_anc.append("path")
      .attr("d", "M250,130 L250,190")
      .classed("info-line", true);

  party_anc.append("g")
      .attr("transform", "translate(200,120)")
      .append("text")
          .text("African National Congress")
          .classed("info-text", true);

  var party_eff = svg.append("g");
  party_eff.append("path")
      .attr("d", "M120,220 L100,100")
      .classed("info-line", true);

  party_eff.append("g")
      .attr("transform", "translate(200,90)")
      .attr("text-anchor", "end")
      .append("text")
          .text("Economic Freedom Fighters")
          .classed("info-text", true);

  svg.append("text")
      .attr("class", "x axis-label")
      .attr("text-anchor", "start")
      .attr("x", xScale(30.6))
      .attr("y", yScale(0.015))
      .text("Younger candidates")
      .classed("x-axis-label", true);

  svg.append("text")
      .attr("class", "y axis-label")
      .attr("text-anchor", "middle")
      .attr("y", -45)
      .attr("x", -210)
      .attr("transform", "rotate(-90)")
      .text("Percentage female candidates");


  svg.append("text")
  .text("Median age of candidates (years)")
  .attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(-0.09) + ")")
  .attr("text-anchor", "middle")
  .classed("x-axis-label", true);

  svg.append("text")
  .text("Hover over the circles for more information")
  .attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(-0.13) + ")")
  .attr("text-anchor", "middle")
  .classed("instructions", true)
  .classed("x-axis-label", true);

  svg.append("text")
  .text("Political party candidates for 2019")
  .attr("transform", "translate(" + xScale((minAge + maxAge) / 2) + "," + yScale(0.9) + ")")
  .attr("text-anchor", "middle")
  .classed("heading", true);

  var buttons = container.append("div").classed("candidate-buttons", true);
  buttons.append("button")
      .text("All Candidates")
      .classed("action-button", true)
      .on("click", function() {
          selectAll(".dot").transition().duration(transitionDuration).call(position).on("end", function() {
              selectAll(".info-text").style("display", "block");
              selectAll(".info-line").style("display", "block");
          });
      });

  buttons.append("button")
      .text("Top 10 Candidates")
      .classed("action-button", true)
      .on("click", function() {
          selectAll(".dot").transition().duration(transitionDuration).call(position10).on("start", function() {
              selectAll(".info-text").style("display", "none");
              selectAll(".info-line").style("display", "none");
          });
      });

  buttons.append("button")
      .text("Ward Candidates")
      .classed("action-button", true)
      .on("click", function() {
          selectAll(".dot").transition().duration(transitionDuration).call(position_ward).on("end", function() {
              selectAll(".info-text").style("display", "none");
              selectAll(".info-line").style("display", "none");
          });
      });
  buttons.append("button")
      .text("PR Candidates")
      .classed("action-button", true)
      .on("click", function() {
          selectAll(".dot").transition().duration(transitionDuration).call(position_pr).on("end", function() {
              selectAll(".info-text").style("display", "none");
              selectAll(".info-line").style("display", "none");
          });
      });

}());

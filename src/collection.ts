import config from '@/config';
import { clone, every, extend, filter, find, forEach, indexOf, map, matches, result, some } from 'lodash';
import Model from './model';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

const setOptions = { add: true, remove: true, merge: true };
const addOptions = { add: true, remove: false };

function splice(array, insert, at: number) {
  at = Math.min(Math.max(at, 0), array.length);
  const tail = Array(array.length - at);
  const length = insert.length;

  for (let i = 0; i < tail.length; i++) {
    tail[i] = array[i + at];
  }

  for (let i = 0; i < length; i++) {
    array.splice(i + at, 1, insert[i]);
  }

  for (let i = 0; i < tail.length; i++) {
    array.splice(i + length + at, 1, tail[i]);
  }
};

export default class Collection {
  axios: AxiosInstance = axios;
  url: string | (() => string) = '';
  Model = Model;
  models = [];
  length = 0;
  _byId = {};
  fetchLoading = false;
  fetchError = null;
  createLoading = false;
  createError = null;

  constructor(models, options = {}) {
    if (models) {
      this.reset(models, clone(options));
    }
  }

  toJSON() {
    return this.map(model => model.toJSON());
  }

  add(models, options) {
    return this.set(models, extend({ merge: false }, options, addOptions));
  }

  remove(models) {
    const isSingular = !Array.isArray(models);
    models = isSingular ? [models] : models.slice();

    const removed = this._removeModels(models);

    return isSingular ? removed[0] : removed;
  }

  get(obj) {
    if (obj == null) return undefined;

    return this._byId[obj] ||
      this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj)] ||
      (obj.cid && this._byId[obj.cid]);
  }

  where(attrs, firstOnly) {
    return this[firstOnly ? 'find' : 'filter'](attrs);
  }

  findWhere(attrs) {
    return this.where(attrs, true);
  }

  set(models, options) {
    if (models == null) return;

    options = extend({}, setOptions, options);

    const isSingular = !Array.isArray(models);
    models = isSingular ? [models] : models.slice();

    let at = options.at;
    if (at != null) at = +at;
    if (at > this.length) at = this.length;
    if (at < 0) at += this.length + 1;

    const set = [];
    const toAdd = [];
    const toMerge = [];
    const toRemove = [];
    const modelMap = {};
    const isAdd = options.add;
    const isMerge = options.merge;
    const isRemove = options.remove;

    let model;
    for (let i = 0; i < models.length; i++) {
      model = models[i];

      const existing = this.get(model);
      if (existing) {
        if (isMerge && model !== existing) {
          const attrs = this._isModel(model) ? model.attributes : model;
          existing.set(attrs, options);
          toMerge.push(existing);
        }

        if (!modelMap[existing.cid]) {
          modelMap[existing.cid] = true;
          set.push(existing);
        }

        models[i] = existing;
      } else if (isAdd) {
        model = models[i] = this._prepareModel(model, options);
        if (model) {
          toAdd.push(model);
          this._addReference(model);
          modelMap[model.cid] = true;
          set.push(model);
        }
      }
    }

    if (isRemove) {
      for (let i = 0; i < this.length; i++) {
        model = this.models[i];

        if (!modelMap[model.cid]) {
          toRemove.push(model);
        };
      }

      if (toRemove.length) {
        this._removeModels(toRemove);
      }
    }

    const isReplace = isAdd && isRemove;
    if (set.length && isReplace) {
      this.models.splice(0);
      splice(this.models, set, 0);
      this.length = this.models.length;
    } else if (toAdd.length) {
      splice(this.models, toAdd, at == null ? this.length : at);
      this.length = this.models.length;
    }

    return isSingular ? models[0] : models;
  }

  reset(models, options = {}) {
    options = clone(options);

    for (let i = 0; i < this.models.length; i++) {
      this._removeReference(this.models[i]);
    }

    this._reset();

    models = this.add(models, extend({ silent: true }, options));

    return models;
  }

  // Override if needed
  async mockGetRequest() { }

  async fetch(params) {
    console.debug(`${this.constructor.name}#fetch`);

    try {
      this.fetchLoading = true;
      this.fetchError = null;
      this.reset();

      let models;
      if (config.useMockApi) {
        models = await this.mockGetRequest();
      } else {
        const { data } = await this.axios.get(result(this, 'url'), { params });
        models = data;
      }

      this.reset(models);
    } catch (error) {
      this.fetchError = error;
    } finally {
      this.fetchLoading = false;
    }
  }

  // Override if needed
  async mockPostRequest() { }

  async create(attributes) {
    console.debug(`${this.constructor.name}#create`);

    try {
      this.createLoading = true;
      this.createError = null;

      let model;
      if (config.useMockApi) {
        model = await this.mockPostRequest();
      } else {
        const { data } = await this.axios.post(result(this, 'url'), attributes);

        model = { ...attributes, ...data };
      }

      this.add(model);

      return model;
    } catch (error) {
      this.createError = error;
    } finally {
      this.createLoading = false;
    }
  }

  modelId(attrs) {
    return attrs[this.Model.prototype.idAttribute || 'id'];
  }

  values() {
    return new CollectionIterator(this, ITERATOR_VALUES);
  }

  keys() {
    return new CollectionIterator(this, ITERATOR_KEYS);
  }

  entries() {
    return new CollectionIterator(this, ITERATOR_KEYSVALUES);
  }

  forEach(iteratee) {
    return forEach(this.models, iteratee);
  }

  map(iteratee) {
    return map(this.models, iteratee);
  }

  find(predicate) {
    return find(this.models, this._predicateHandler(predicate));
  }

  filter(predicate) {
    return filter(this.models, this._predicateHandler(predicate));
  }

  every(predicate) {
    return every(this.models, this._predicateHandler(predicate));
  }

  some(predicate) {
    return some(this.models, this._predicateHandler(predicate));
  }

  indexOf(value) {
    return indexOf(this.models, value);
  }

  _reset() {
    this.length = 0;
    this.models = [];
    this._byId = {};
  }

  _prepareModel(attrs, options = {}) {
    if (this._isModel(attrs)) {
      if (!attrs.collection) {
        attrs.collection = this;
      };

      return attrs;
    }

    options = clone(options);
    options.collection = this;

    const model = new this.Model(attrs, options);

    return model;
  }

  _removeModels(models) {
    const removed = [];

    for (let i = 0; i < models.length; i++) {
      const model = this.get(models[i]);
      if (!model) continue;

      const index = this.indexOf(model);
      this.models.splice(index, 1);
      this.length--;

      delete this._byId[model.cid];
      const id = this.modelId(model.attributes);
      if (id != null) delete this._byId[id];

      removed.push(model);
      this._removeReference(model);
    }

    return removed;
  }

  _isModel(model) {
    return model instanceof Model;
  }

  _addReference(model) {
    this._byId[model.cid] = model;

    const id = this.modelId(model.attributes);
    if (id != null) {
      this._byId[id] = model;
    };
  }

  _removeReference(model) {
    delete this._byId[model.cid];

    const id = this.modelId(model.attributes);
    if (id != null) {
      delete this._byId[id];
    };

    if (this === model.collection) {
      delete model.collection;
    };
  }

  _predicateHandler(predicate) {
    if (typeof predicate === 'object') {
      return this._modelMatcher(predicate);
    }

    return predicate;
  }

  _modelMatcher(attrs) {
    const matcher = matches(attrs);

    return function (model) {
      return matcher(model.attributes);
    };
  }
}

/* global Symbol */
const $$iterator = typeof Symbol === 'function' && Symbol.iterator;
if ($$iterator) {
  Collection.prototype[$$iterator] = Collection.prototype.values;
}

const CollectionIterator = function (collection, kind) {
  this._collection = collection;
  this._kind = kind;
  this._index = 0;
};

const ITERATOR_VALUES = 1;
const ITERATOR_KEYS = 2;
const ITERATOR_KEYSVALUES = 3;

if ($$iterator) {
  CollectionIterator.prototype[$$iterator] = function () {
    return this;
  };
}

CollectionIterator.prototype.next = function () {
  if (this._collection) {
    if (this._index < this._collection.length) {
      const model = this._collection.at(this._index);
      this._index++;

      let value;
      if (this._kind === ITERATOR_VALUES) {
        value = model;
      } else {
        const id = this._collection.modelId(model.attributes);
        if (this._kind === ITERATOR_KEYS) {
          value = id;
        } else { // ITERATOR_KEYSVALUES
          value = [id, model];
        }
      }
      return { value, done: false };
    }

    this._collection = undefined;
  }

  return { value: undefined, done: true };
};

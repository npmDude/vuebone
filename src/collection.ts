import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { clone, every, extend, filter, find, forEach, indexOf, ListIterateeCustom, ListIterator, map, matches, result, some } from 'lodash';
import Model, { ModelConstructor, ModelSaveOptions, ModelTypeParamaterT } from './model';
import { ObjectHash, Parseable } from './types';

const ITERATOR_VALUES = 1;
const ITERATOR_KEYS = 2;
const ITERATOR_KEYSVALUES = 3;

const setOptions = { add: true, remove: true, merge: true };
const addOptions = { add: true, remove: false };

function splice(array: any[], insert: any[], at: number) {
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

interface CollectionConstructorOptions<TModel extends Model> extends Parseable, ObjectHash {
  model?: ModelConstructor<ModelTypeParamaterT<TModel>>;
}

interface AddOptions {
  at?: number;
  merge?: boolean;
}

interface CollectionSetOptions extends Parseable, AddOptions {
  add?: boolean;
  remove?: boolean;
}

interface CollectionFetchOptions extends AxiosRequestConfig, Parseable { }

export default class Collection<TModel extends Model = Model> {
  axios: AxiosInstance = axios;
  url: string | (() => string) = '';
  model: ModelConstructor<ModelTypeParamaterT<TModel>> = Model;
  models: TModel[] = [];
  length = 0;
  private _byId: Record<string, TModel> = {};
  fetchLoading = false;
  fetchError: any | null = null;
  createLoading = false;
  createError: any | null = null;

  constructor(models?: TModel[], options?: CollectionConstructorOptions<TModel>) {
    if (options) {
      if (options.model) {
        this.model = options.model;
      }
    }

    if (models) {
      this.reset(models);
    }
  }

  toJSON() {
    return this.map((model: TModel) => model.toJSON());
  }

  add(models: Array<{} | TModel>): TModel[];
  add(model: {} | TModel): TModel;
  add(models: {} | TModel | Array<{} | TModel>): TModel[] | TModel | void {
    return this.set(models, extend({ merge: false }, addOptions));
  }

  remove(models: TModel | Array<TModel>): TModel[] | TModel {
    let isSingular, modelsArray: Array<TModel>;
    if (!Array.isArray(models)) {
      isSingular = true;
      modelsArray = [models];
    } else {
      isSingular = false;
      modelsArray = models.slice();
    }

    const removed = this._removeModels(modelsArray);

    return isSingular ? removed[0] : removed;
  }

  get(obj: number | string | any | Model): TModel | undefined {
    if (obj == null) return undefined;

    let model: TModel | undefined = undefined;
    if (typeof obj === 'string' || typeof obj === 'number') {
      model = this._byId[obj];

      return model;
    } else {
      model = this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj)]

      if (model) {
        return model;
      } else if (obj.cid) {
        model = this._byId[obj.cid];
      }

      return model;
    }
  }

  at(index: number): TModel {
    if (index < 0) index += this.length;

    return this.models[index];
  }

  where(attrs: any, firstOnly: boolean) {
    return this[firstOnly ? 'find' : 'filter'](attrs);
  }

  findWhere(attrs: any) {
    return this.where(attrs, true);
  }

  set(model?: {} | TModel, options?: CollectionSetOptions): TModel | void;
  set(models?: Array<{} | TModel>, options?: CollectionSetOptions): TModel[] | void;
  set(models?: {} | TModel | Array<{} | TModel>, options?: CollectionSetOptions): TModel[] | TModel | void {
    if (models == null) return;

    options = extend({}, setOptions, options);
    if (options.parse && !this._isModel(models)) {
      models = this.parse(models);
    }

    let isSingular, modelsArray: Array<{} | TModel>;
    if (!Array.isArray(models)) {
      isSingular = true;
      modelsArray = [models];
    } else {
      isSingular = false;
      modelsArray = models.slice();
    }

    let at = options.at;
    if (at != null) {
      at = +at;
      if (at > this.length) at = this.length;
      if (at < 0) at += this.length + 1;
    }

    const set = [];
    const toAdd = [];
    const toMerge = [];
    const toRemove = [];
    const modelMap: Record<string, boolean> = {};
    const isAdd = options.add;
    const isMerge = options.merge;
    const isRemove = options.remove;

    for (let i = 0; i < modelsArray.length; i++) {
      const model = modelsArray[i];

      const existing = this.get(model);
      if (existing) {
        if (isMerge && model !== existing) {
          const attrs = this._isModel(model) ? model.attributes : model;
          existing.set(attrs);
          toMerge.push(existing);
        }

        if (!modelMap[existing.cid]) {
          modelMap[existing.cid] = true;
          set.push(existing);
        }

        modelsArray[i] = existing;
      } else if (isAdd) {
        const newModel = this._prepareModel(modelsArray[i], options) as TModel;

        if (newModel) {
          toAdd.push(newModel);
          this._addReference(newModel);
          modelMap[newModel.cid] = true;
          set.push(newModel);
        }
      }
    }

    if (isRemove) {
      for (let i = 0; i < this.length; i++) {
        const model = this.models[i];

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

    return isSingular ? modelsArray[0] as TModel : modelsArray as TModel[];
  }

  reset(models?: Array<{} | TModel>): TModel[] | void {
    for (let i = 0; i < this.models.length; i++) {
      this._removeReference(this.models[i]);
    }

    this._reset();

    if (models) {
      return this.add(models);
    }
  }

  async fetch(options: CollectionFetchOptions) {
    console.debug(`${this.constructor.name}#fetch`);

    try {
      this.fetchLoading = true;
      this.fetchError = null;
      this.reset();

      const { parse, ...axiosConfig } = extend({ parse: true }, options);

      let models;
      const { data } = await this.axios.get(result(this, 'url'), axiosConfig);
      models = data;

      this.reset(models);
    } catch (error) {
      this.fetchError = error;
    } finally {
      this.fetchLoading = false;
    }
  }

  async create(attributes: any, options?: ModelSaveOptions) {
    console.debug(`${this.constructor.name}#create`);

    try {
      this.createLoading = true;
      this.createError = null;

      const { parse, ...axiosConfig } = extend({ parse: true }, options);

      let model;
      const { data } = await this.axios.post(result(this, 'url'), attributes, axiosConfig);

      model = { ...attributes, ...data };

      this.add(model);

      return model;
    } catch (error) {
      this.createError = error;
    } finally {
      this.createLoading = false;
    }
  }

  parse(response: any): Array<{}> {
    return response;
  }

  modelId(attrs: any) {
    return attrs[this.model.prototype.idAttribute || 'id'];
  }

  values(): Iterator<TModel> {
    return new CollectionIterator(this, ITERATOR_VALUES);
  }

  keys(): Iterator<any> {
    return new CollectionIterator(this, ITERATOR_KEYS);
  }

  entries(): Iterator<[any, TModel]> {
    return new CollectionIterator(this, ITERATOR_KEYSVALUES);
  }

  forEach(iteratee: ListIterator<TModel, any>): TModel[] {
    return forEach(this.models, iteratee);
  }

  map<TResult>(iteratee: ListIterator<TModel, TResult>): TResult[] {
    return map(this.models, iteratee);
  }

  find(predicate: ListIterateeCustom<TModel, boolean>) {
    return find(this.models, this._predicateHandler(predicate));
  }

  filter(predicate: ListIterateeCustom<TModel, boolean>) {
    return filter(this.models, this._predicateHandler(predicate));
  }

  every(predicate: ListIterateeCustom<TModel, boolean>) {
    return every(this.models, this._predicateHandler(predicate));
  }

  some(predicate: ListIterateeCustom<TModel, boolean>) {
    return some(this.models, this._predicateHandler(predicate));
  }

  indexOf(value: TModel) {
    return indexOf(this.models, value);
  }

  private _reset() {
    this.length = 0;
    this.models = [];
    this._byId = {};
  }

  private _prepareModel(attributes?: any, options: any = {}) {
    if (this._isModel(attributes)) {
      if (!attributes.collection) {
        attributes.collection = this;
      };

      return attributes;
    }

    options = clone(options);
    options.collection = this;

    const model = new this.model(attributes, options);

    return model;
  }

  private _removeModels(models: TModel[]) {
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

  private _isModel(model: any): model is TModel {
    return model instanceof Model;
  }

  private _addReference(model: TModel) {
    this._byId[model.cid] = model;

    const id = this.modelId(model.attributes);
    if (id != null) {
      this._byId[id] = model;
    };
  }

  private _removeReference(model: TModel) {
    delete this._byId[model.cid];

    const id = this.modelId(model.attributes);
    if (id != null) {
      delete this._byId[id];
    };

    if (this === model.collection) {
      delete model.collection;
    };
  }

  private _predicateHandler(predicate: Partial<ModelTypeParamaterT<TModel>> | ListIterateeCustom<TModel, boolean>): ListIterateeCustom<TModel, boolean> {
    if (typeof predicate === 'object') {
      return this._modelMatcher(predicate as Partial<ModelTypeParamaterT<TModel>>);
    }

    return predicate;
  }

  private _modelMatcher(attrs: Partial<ModelTypeParamaterT<TModel>>) {
    const matcher = matches(attrs);

    return function (model: TModel) {
      return matcher(model.attributes);
    };
  }

  [Symbol.iterator] = this.values;
}

class CollectionIterator<TModel extends Model = any, TCollection extends Collection<TModel> = any> {
  _collection: TCollection | undefined;
  _kind: number;
  _index = 0;

  constructor(collection: TCollection, kind: number) {
    this._collection = collection;
    this._kind = kind;
  }

  next() {
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
  }

  [Symbol.iterator]() {
    return this;
  };
}

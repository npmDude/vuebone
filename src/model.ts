import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { clone, extend, isEqual, result, uniqueId } from 'lodash';
import Vue from 'vue';
import Collection from './collection';
import { ObjectHash, Parseable, StringKey } from './generic-types';

interface ModelConstructorOptions<TModel extends Model = any> extends Parseable, ObjectHash {
  collection?: Collection<TModel>;
}

export type ModelTypeParamaterT<TModel extends Model> = TModel extends Model<infer T> ? T : never;

export type ModelConstructor<T extends ObjectHash> = new (attributes?: Partial<T>, options?: ModelConstructorOptions) => Model<T>;

interface ModelFetchOptions extends AxiosRequestConfig, Parseable { }

export interface ModelSaveOptions extends AxiosRequestConfig, Parseable { }

interface ModelDestroyOptions extends AxiosRequestConfig { }

export default class Model<T extends ObjectHash = any> {
  axios: AxiosInstance = axios;
  urlRoot: string | (() => string) = '';
  idAttribute = 'id';
  cidPrefix = 'c';
  id?: string | number = undefined;
  cid!: string;
  /**
   * Default attributes for the model.
   * It can be an object hash or a method returning an object hash.
   */
  defaults: Partial<T> | (() => Partial<T>) = () => ({});
  attributes: Partial<T> = {};
  collection?: Collection<this>;
  fetchLoading = false;
  fetchError: any | null = null;
  saveLoading = false;
  saveError: any | null = null;
  deleteLoading = false;
  deleteError: any | null = null;

  preinitialize: ((attributes: Partial<T>, options?: ModelConstructorOptions) => void) | undefined;
  constructor(attributes: Partial<T> = {}, options?: ModelConstructorOptions) {
    if (this.preinitialize) {
      this.preinitialize(attributes, options);
    }

    Vue.set(this, 'cid', uniqueId(this.cidPrefix));

    if (options) {
      if (options.collection) {
        Vue.set(this, 'collection', options.collection);
      };

      if (options.parse) {
        attributes = this.parse(attributes);
      }
    }

    const defaultAttributes = result<Partial<T> | undefined>(this, 'defaults');

    attributes = extend({}, defaultAttributes, attributes);

    this.set(attributes);
  }

  /**
   * Copies of the model's attributes object.
   * @returns copy of model's attributes object
   */
  toJSON(): Partial<T> {
    return clone(this.attributes);
  }

  /**
   * Get the value of an attribute.
   * @param attributeName
   * @returns value
   */
  get<A extends StringKey<T>>(attributeName: A) {
    return this.attributes[attributeName];
  }

  /**
   * Checks whether the model's attribute contains a value.
   * @param attributeName
   * @returns true if the attribute contains a value that is not null or undefined
   */
  has<A extends StringKey<T>>(attributeName: A) {
    return this.get(attributeName) != null;
  }

  /**
   * Set a hash of attributes on the model.
   * @param attributes hash of attributes
   */
  set(attributes: Partial<T>): any {
    for (const key in attributes) {
      Vue.set(this.attributes, key, attributes[key]);
    }

    if (this.idAttribute in attributes) {
      Vue.set(this, 'id', this.get(this.idAttribute));
    }
  }

  /**
   * Compares the difference between the model's attributes and another object.
   * @param objToCompare
   * @returns object hash of difference or false
   */
  compareAttributes(objToCompare: Partial<T>): Partial<T> | false {
    const changes: Partial<T> = {};
    let hasChanges = false;

    // Loop on each property of "objToCompare"
    for (const property in objToCompare) {
      const value = objToCompare[property];

      // If value is equal to the attribute value, skip it
      if (isEqual(this.attributes[property], value)) continue;

      // Add property and value on changes object
      changes[property] = value;
      hasChanges = true;
    }

    // If hasChanges, return changes else false
    return hasChanges ? changes : false;
  }

  /**
   * Fetch the model from the server, merging the response with the model's local attributes.
   * @param options
   */
  async fetch(options: ModelFetchOptions) {
    if (__DEV__) {
      console.debug(`${this.constructor.name}#fetch`);
    }

    try {
      Vue.set(this, 'fetchLoading', true);
      Vue.set(this, 'fetchError', null);

      const { parse, ...axiosConfig } = extend({ parse: true }, options);

      const { data } = await this.axios.get(this.url(), axiosConfig);

      const serverAttributes = parse ? this.parse(data) : data;

      this.set(serverAttributes);
    } catch (error) {
      if (__DEV__) {
        console.error(`${this.constructor.name}#fetchError`, error);
      }

      Vue.set(this, 'fetchError', error);
    } finally {
      Vue.set(this, 'fetchLoading', false);
    }
  }

  /**
   * Set a hash of model attributes, and sync the model to the server.
   * If the server returns an attributes hash that differs, it will be merged.
   * @param attributes hash of attributes
   * @param options
   */
  async save(attributes?: Partial<T>, options?: ModelSaveOptions) {
    if (__DEV__) {
      console.debug(`${this.constructor.name}#save`);
    }

    try {
      Vue.set(this, 'saveLoading', true);
      Vue.set(this, 'saveError', null);

      const { parse, ...axiosConfig } = extend({ parse: true }, options);

      let serverData;
      if (this.isNew()) {
        const { data } = await this.axios.post(this.url(), { ...this.attributes, ...attributes }, axiosConfig);
        serverData = data;
      } else {
        const { data } = await this.axios.patch(this.url(), attributes, axiosConfig);
        serverData = data;
      }

      const serverAttributes = parse ? this.parse(serverData) : serverData;

      const combinedAttributes = extend({}, attributes, serverAttributes);

      this.set(combinedAttributes);
    } catch (error) {
      if (__DEV__) {
        console.error(`${this.constructor.name}#saveError`, error);
      }

      Vue.set(this, 'saveError', error);
    } finally {
      Vue.set(this, 'saveLoading', false);
    }
  }

  async forcePost(attributes?: Partial<T>, options?: ModelSaveOptions) {
    if (__DEV__) {
      console.debug(`${this.constructor.name}#save`);
    }

    try {
      Vue.set(this, 'saveLoading', true);
      Vue.set(this, 'saveError', null);

      const { parse, ...axiosConfig } = extend({ parse: true }, options);

      const { data: serverData } = await this.axios.post(this.baseUrl(), { ...this.attributes, ...attributes }, axiosConfig);

      const serverAttributes = parse ? this.parse(serverData) : serverData;

      const combinedAttributes = extend({}, attributes, serverAttributes);

      this.set(combinedAttributes);
    } catch (error) {
      if (__DEV__) {
        console.error(`${this.constructor.name}#saveError`, error);
      }

      Vue.set(this, 'saveError', error);
    } finally {
      Vue.set(this, 'saveLoading', false);
    }
  }

  /**
   * Destroy this model on the server if it was already persisted.
   * Optimistically removes the model from its collection, if it has one.
   * @param options
   */
  async destroy(options?: ModelDestroyOptions) {
    if (__DEV__) {
      console.debug(`${this.constructor.name}#destroy`);
    }

    try {
      Vue.set(this, 'deleteLoading', true);
      Vue.set(this, 'deleteError', null);

      await this.axios.delete(this.url(), options);

      if (this.collection) {
        this.collection.remove(this);
      }
    } catch (error) {
      if (__DEV__) {
        console.error(`${this.constructor.name}#destroyError`, error);
      }

      Vue.set(this, 'deleteError', error);
    } finally {
      Vue.set(this, 'deleteLoading', false);
    }
  }

  /**
   * Default URL for the model's representation on the server
   * @returns model's URL
   */
  url() {
    const base = this.baseUrl();

    if (this.isNew()) {
      return base;
    }

    const id = this.get(this.idAttribute);

    return base.replace(/[^/]$/, '$&/') + id;
  }

  baseUrl() {
    return result<string>(this, 'urlRoot') || result<string>(this.collection, 'url');
  }

  /**
   * Converts a reponse into the hash of attributes to be `set` on the model.
   * The default implementation is just to pass the response along.
   */
  parse(response: any): Partial<T> {
    return response;
  }

  /**
   * Creates a new model with identical attributes.
   */
  clone(options: Record<string, any>): Model {
    return new (<ModelConstructor<T>>this.constructor)(this.attributes, {
      collection: this.collection,
      ...options
    });
  }

  /**
   * Checks the model for an id to determine whether it is new.
   */
  isNew() {
    return !this.has(this.idAttribute);
  }
}

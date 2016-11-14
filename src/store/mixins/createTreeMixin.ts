import { CrudOptions, UpdateResults, Store } from '../createStore';
import { QueryMixin, QueryOptions } from './createQueryMixin';
import WeakMap from 'dojo-shim/WeakMap';
import { SubcollectionStore, SubcollectionOptions } from '../createSubcollectionStore';
import { ComposeMixinDescriptor } from 'dojo-compose/compose';
import createFilter from '../../query/createFilter';
import {Query} from '../../query/interfaces';
import createCompoundQuery from '../../query/createCompoundQuery';

export interface TreeMixin<T, O extends CrudOptions, U extends UpdateResults<T>, C extends Store<T, O, U>> extends QueryMixin<T, O, U, C> {
	tree(): C & this;
	getChildren(item: T): Promise<T[]>;
	getRootCollection(): C & this;
	expand(ids: string | string[]): void;
	collapse(ids: string | string[]): void;
}

interface TreeMixinState {
	expanded: string[];
	newTree?: boolean;
	ignoreExpanded?: boolean;
}

const instanceStateMap = new WeakMap<TreeMixin<any, any, any, any>, TreeMixinState>();

type TreeStoreSubCollection<T, O extends CrudOptions, U extends UpdateResults<T>, C extends Store<T, O, U>> =
	TreeMixin<T, O, U, C> & SubcollectionStore<T, O, U, C & TreeMixin<T, O, U, C>>;

function createTreeMixin<T, O extends CrudOptions, U extends UpdateResults<T>, C extends Store<T, O, U>>(): ComposeMixinDescriptor<
	SubcollectionStore<T, O, U, C> & QueryMixin<T, O, U, C>,
	SubcollectionOptions<T, O, U> & QueryOptions<T>,
	TreeMixin<T, O, U, C>,
	TreeMixinState
> {
	const treeMixin: any = {
		tree(this: TreeStoreSubCollection<T, O, U, C>) {
			const state = instanceStateMap.get(this);
			state.newTree = true;
			const newTree = this.createSubcollection();
			state.newTree = false;
			return newTree;
		},
		getChildren(this: TreeStoreSubCollection<T, O, U, C>, item: T) {
			const state = instanceStateMap.get(this);
			state.ignoreExpanded = true;
			const fetchResults = this.fetch(createFilter<T>().equalTo('parent', this.identify(item)[0]));
			state.ignoreExpanded = false;
			return fetchResults;
		},
		getRootCollection(this: TreeStoreSubCollection<T, O, U, C>) {
			return this.filter(createFilter<T>().equalTo('parent', null));
		},
		expand(this: TreeStoreSubCollection<T, O, U, C>, ids: string | string[]) {
			const state = instanceStateMap.get(this);
			state.expanded = [ ...state.expanded, ...(Array.isArray(ids) ? ids : [ ids ]) ];
		},
		collapse(this: TreeStoreSubCollection<T, O, U, C>, ids: string | string[]) {
			const state = instanceStateMap.get(this);
			const idArray: string[] = Array.isArray(ids) ? ids : [ ids ];
			idArray.forEach((id) => {
				const index = state.expanded.indexOf(id);
				if (index > -1) {
					state.expanded.splice(index, 1);
				}
			});
		}
	};

	return {
		mixin: treeMixin,
		initialize(instance: TreeMixin<any, any, any, any>, options?: TreeMixinState) {
			options = options || {
				expanded: []
			};
			instanceStateMap.set(instance, options);
		},
		aspectAdvice: {
			before: {
				createSubcollection(this: TreeStoreSubCollection<T, O, U, C>, options?: TreeMixinState) {
					options = options || { expanded: [] };
					const state = instanceStateMap.get(this);
					if (!state.newTree) {
						options.expanded = state.expanded;
					}
					return [ options ];
				},
				fetch(this: TreeStoreSubCollection<T, O, U, C>, ...args: any[]) {
					const state = instanceStateMap.get(this);
					if (!state.ignoreExpanded) {
						const expandedQuery = createCompoundQuery({
							query: createFilter<T>()
								.in('parent', state.expanded.slice())
								.or()
								.equalTo('parent', null)
								.or()
								.equalTo('parent', undefined)
						});
						let query = <Query<T, T>> args[0];
						query = query ? expandedQuery.withQuery(query) : expandedQuery;
						args[0] = query;
					}
					return args;
				}
			}
		}
	};
}

export default createTreeMixin;

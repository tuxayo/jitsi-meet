import React, { Component } from 'react';
import { AppRegistry, Linking } from 'react-native';
import { createStore } from 'redux';
import Thunk from 'redux-thunk';

import config from './config';
import { App } from './features/app';
import {
    MiddlewareRegistry,
    ReducerRegistry
} from './features/base/redux';

// Create combined reducer from all reducers in registry.
const reducer = ReducerRegistry.combineReducers();

// Apply all registered middleware from the MiddlewareRegistry + additional
// 3rd party middleware:
// - Thunk - allows us to dispatch async actions easily. For more info
// @see https://github.com/gaearon/redux-thunk.
const middleware = MiddlewareRegistry.applyMiddleware(Thunk);

// Create Redux store with our reducer and middleware.
const store = createStore(reducer, middleware);

/**
 * React Native doesn't support specifying props to the main/root component (in
 * the JS/JSX source code). So create a wrapper React Component (class) around
 * features/app's App instead.
 *
 * @extends Component
 */
class Root extends Component {
    /**
     * Initializes a new Root instance.
     *
     * @param {Object} props - The read-only properties with which the new
     * instance is to be initialized.
     */
    constructor(props) {
        super(props);

        /**
         * The initial state of this Component.
         *
         * @type {{url: string}}
         */
        this.state = {
            /**
             * The URL, if any, with which the app was launched.
             *
             * @type {string}
             */
            url: undefined
        };

        // Handle the URL, if any, with which the app was launched.
        Linking.getInitialURL()
            .then(url => this.setState({ url }))
            .catch(err => {
                console.error('Failed to get initial URL', err);

                // XXX Start with an empty URL if getting the initial URL fails;
                // otherwise, nothing will be rendered.
                this.setState({ url: null });
            });
    }

    /**
     * Implements React's {@link Component#render()}.
     *
     * @inheritdoc
     * @returns {ReactElement}
     */
    render() {
        // XXX We don't render the App component until we get the initial URL,
        // either it's null or some other non-null defined value;
        if (typeof this.state.url === 'undefined') {
            return null;
        }

        return (
            <App
                config = { config }
                store = { store }
                url = { this.state.url } />
        );
    }
}

// Register the main Component.
AppRegistry.registerComponent('App', () => Root);

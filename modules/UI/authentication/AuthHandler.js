/* global APP, config, JitsiMeetJS, Promise */
const logger = require("jitsi-meet-logger").getLogger(__filename);

import LoginDialog from './LoginDialog';
import UIUtil from '../util/UIUtil';
import {openConnection} from '../../../connection';

const ConnectionErrors = JitsiMeetJS.errors.connection;

let externalAuthWindow;
let authRequiredDialog;

let isTokenAuthEnabled
    = typeof config.tokenAuthUrl === "string" && config.tokenAuthUrl.length;
let getTokenAuthUrl
    = JitsiMeetJS.util.AuthUtil.getTokenAuthUrl.bind(null, config.tokenAuthUrl);

/**
 * Authenticate using external service or just focus
 * external auth window if there is one already.
 *
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function doExternalAuth (room, lockPassword) {
    if (externalAuthWindow) {
        externalAuthWindow.focus();
        return;
    }
    if (room.isJoined()) {
        let getUrl;
        if (isTokenAuthEnabled) {
            getUrl = Promise.resolve(getTokenAuthUrl(room.getName(), true));
            initJWTTokenListener(room);
        } else {
            getUrl = room.getExternalAuthUrl(true);
        }
        getUrl.then(function (url) {
            externalAuthWindow = LoginDialog.showExternalAuthDialog(
                url,
                function () {
                    externalAuthWindow = null;
                    if (!isTokenAuthEnabled) {
                        room.join(lockPassword);
                    }
                }
            );
        });
    } else {
        // If conference has not been started yet
        // then  redirect to login page
        if (isTokenAuthEnabled) {
            redirectToTokenAuthService(room.getName());
        } else {
            room.getExternalAuthUrl().then(UIUtil.redirect);
        }
    }
}

/**
 * Redirect the user to the token authentication service for the login to be
 * performed. Once complete it is expected that the service wil bring the user
 * back with "?jwt={the JWT token}" query parameter added.
 * @param {string} [roomName] the name of the conference room.
 */
function redirectToTokenAuthService(roomName) {
    UIUtil.redirect(getTokenAuthUrl(roomName, false));
}

/**
 * Initializes 'message' listener that will wait for a JWT token to be received
 * from the token authentication service opened in a popup window.
 * @param room the name fo the conference room.
 */
function initJWTTokenListener(room) {
    var listener = function (event) {
        if (externalAuthWindow !== event.source) {
            logger.warn("Ignored message not coming " +
                "from external authnetication window");
            return;
        }
        if (event.data && event.data.jwtToken) {
            config.token = event.data.jwtToken;
            logger.info("Received JWT token:", config.token);
            var roomName = room.getName();
            openConnection({retry: false, roomName: roomName })
                .then(function (connection) {
                    // Start new connection
                    let newRoom = connection.initJitsiConference(
                        roomName, APP.conference._getConferenceOptions());
                    // Authenticate from the new connection to get
                    // the session-ID from the focus, which wil then be used
                    // to upgrade current connection's user role
                    newRoom.room.moderator.authenticate().then(function () {
                        connection.disconnect();
                        // At this point we'll have session-ID stored in
                        // the settings. It wil be used in the call below
                        // to upgrade user's role
                        room.room.moderator.authenticate()
                            .then(function () {
                                logger.info("User role upgrade done !");
                                unregister();
                            }).catch(function (err, errCode) {
                                logger.error(
                                    "Authentication failed: ", err, errCode);
                                unregister();
                            }
                        );
                    }).catch(function (error, code) {
                        unregister();
                        connection.disconnect();
                        logger.error(
                            'Authentication failed on the new connection',
                            error, code);
                    });
                }, function (err) {
                    unregister();
                    logger.error("Failed to open new connection", err);
                });
        }
    };
    var unregister = function () {
        window.removeEventListener("message", listener);
    };
    if (window.addEventListener) {
        window.addEventListener("message", listener, false);
    }
}

/**
 * Authenticate on the server.
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function doXmppAuth (room, lockPassword) {
    let loginDialog = LoginDialog.showAuthDialog(function (id, password) {
        // auth "on the fly":
        // 1. open new connection with proper id and password
        // 2. connect to the room
        // (this will store sessionId in the localStorage)
        // 3. close new connection
        // 4. reallocate focus in current room
        openConnection({id, password, roomName: room.getName()}).then(
        function (connection) {
            // open room
            let newRoom = connection.initJitsiConference(
                room.getName(), APP.conference._getConferenceOptions()
            );

            loginDialog.displayConnectionStatus('connection.FETCH_SESSION_ID');

            newRoom.room.moderator.authenticate().then(function () {
                connection.disconnect();

                loginDialog.displayConnectionStatus(
                    'connection.GOT_SESSION_ID');

                // authenticate conference on the fly
                room.join(lockPassword);

                loginDialog.close();
            }).catch(function (error, code) {
                connection.disconnect();

                logger.error('Auth on the fly failed', error);

                loginDialog.displayError(
                    'connection.GET_SESSION_ID_ERROR', {code: code});
            });
        }, function (err) {
            loginDialog.displayError(err);
        });
    }, function () { // user canceled
        loginDialog.close();
    });
}

/**
 * Authenticate for the conference.
 * Uses external service for auth if conference supports that.
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function authenticate (room, lockPassword) {
    if (isTokenAuthEnabled || room.isExternalAuthEnabled()) {
        doExternalAuth(room, lockPassword);
    } else {
        doXmppAuth(room, lockPassword);
    }
}

/**
 * De-authenticate local user.
 *
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 * @returns {Promise}
 */
function logout (room) {
    return new Promise(function (resolve) {
        room.room.moderator.logout(resolve);
    }).then(function (url) {
        // de-authenticate conference on the fly
        if (room.isJoined()) {
            room.join();
        }

        return url;
    });
}

/**
 * Notify user that authentication is required to create the conference.
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function requireAuth(room, lockPassword) {
    if (authRequiredDialog) {
        return;
    }

    authRequiredDialog = LoginDialog.showAuthRequiredDialog(
        room.getName(), authenticate.bind(null, room, lockPassword)
    );
}

/**
 * Close auth-related dialogs if there are any.
 */
function closeAuth() {
    if (externalAuthWindow) {
        externalAuthWindow.close();
        externalAuthWindow = null;
    }

    if (authRequiredDialog) {
        authRequiredDialog.close();
        authRequiredDialog = null;
    }
}

function showXmppPasswordPrompt(roomName, connect) {
    return new Promise(function (resolve, reject) {
        let authDialog = LoginDialog.showAuthDialog(
            function (id, password) {
                connect(id, password, roomName).then(function (connection) {
                    authDialog.close();
                    resolve(connection);
                }, function (err) {
                    if (err === ConnectionErrors.PASSWORD_REQUIRED) {
                        authDialog.displayError(err);
                    } else {
                        authDialog.close();
                        reject(err);
                    }
                });
            }
        );
    });
}

/**
 * Show Authentication Dialog and try to connect with new credentials.
 * If failed to connect because of PASSWORD_REQUIRED error
 * then ask for password again.
 * @param {string} [roomName] name of the conference room
 * @param {function(id, password, roomName)} [connect] function that returns
 * a Promise which resolves with JitsiConnection or fails with one of
 * ConnectionErrors.
 * @returns {Promise<JitsiConnection>}
 */
function requestAuth(roomName, connect) {
    if (isTokenAuthEnabled) {
        // This Promise never resolves as user gets redirected to another URL
        return new Promise(() => redirectToTokenAuthService(roomName));
    } else {
        return showXmppPasswordPrompt(roomName, connect);
    }
}

export default {
    authenticate,
    requireAuth,
    requestAuth,
    closeAuth,
    logout
};

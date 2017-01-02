import './native';

// The library lib-jitsi-meet (externally) depends on the libraries jQuery and
// Strophe
(global => {
    // jQuery
    if (typeof global.$ === 'undefined') {
        const jQuery = require('jquery');

        jQuery(global);
        global.$ = jQuery;
    }

    // Strophe
    if (typeof global.Strophe === 'undefined') {
        require('strophe');
        require('strophejs-plugins/disco/strophe.disco');
        require('strophejs-plugins/caps/strophe.caps.jsonly');
    }
})(global || window || this); // eslint-disable-line no-invalid-this

// Re-export JitsiMeetJS from the library lib-jitsi-meet to (the other features
// of) the project jitsi-meet-react.
//
// TODO The Web support implemented by the jitsi-meet project explicitly uses
// the library lib-jitsi-meet as a binary and keeps it out of the application
// bundle. The mobile support implemented by the jitsi-meet-react project did
// not get to keeping the lib-jitsi-meet library out of the application bundle
// and even used it from source. As an intermediate step, start using the
// library lib-jitsi-meet as a binary on mobile at the time of this writing. In
// the future, implement not packaging it in the application bundle.
import JitsiMeetJS from 'lib-jitsi-meet/lib-jitsi-meet.min';
export { JitsiMeetJS as default };

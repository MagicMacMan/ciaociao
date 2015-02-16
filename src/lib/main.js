var { ToggleButton } = require('sdk/ui/button/toggle');
var child_process = require('sdk/system/child_process');
var panels = require('sdk/panel');
var self = require('sdk/self');
var system = require('sdk/system');
var tabs = require('sdk/tabs');
var timers = require('sdk/timers');

var utils = require('./utils');


exports.main = function(options, callbacks) {
  // XXX this only works on OS X for now.
  if (system.platform !== 'darwin') {
    return;
  }


  /** Toolbar button. */
  var button = ToggleButton({
    id: 'ciaociao-btn',
    label: 'Ciaociao',
    icon: {
      '16': self.data.url('img/icon-16.png'),
      '32': self.data.url('img/icon-32.png'),
      '64': self.data.url('img/icon-64.png')
    },
    contextMenu: true,
    onChange: openPanel
  });

  /** Panel showing the service list. */
  var panel = panels.Panel({
    contentURL: self.data.url('www/panel.html'),
    contentScriptFile: self.data.url('js/panel.js'),
    contentStyleFile: self.data.url('css/panel.css'),
    onHide: function() {
      // Unpress toggle button.
      button.state('window', {checked: false});
    }
  });

  /**
   * Open a clicked link in the panel in a new tab.
   */
  panel.port.on('click', function(msg) {
    tabs.open(msg);
    panel.hide();
  });


  /**
   * Show panel with (previously discovered) services.
   */
  function openPanel(state) {
    if (!state.checked) return;

    panel.port.emit('flush');
    discoverServices();

    panel.show({
      position: button
    });
  }


  /**
   * Discover local web services through dns-sd.
   */
  function discoverServices() {
    // Shell out to DNS-SD
    var dnssd = child_process.spawn('/usr/bin/dns-sd', ['-Z', '_http._tcp']);

    // Don't let this run longer than a few seconds.
    timers.setTimeout(function() {
      try {
        dnssd.kill();
      } catch(e) {}
    }, 5000);

    dnssd.stdout.on('data', function(data) {
      /*
      Valid result looks something like this:

      [...]
      My\032Printer._http._tcp                 SRV     0 0 80 somehostname.local. ; Replace with unicast FQDN of target host
      */

      // Fish out instance names.
      var lines = data.split('\n');
      var hostmatch = /^(\S+)\._http\._tcp.*SRV\s+\d \d (\d+) (\S+)\. ;.*/
      lines.forEach(function(l) {
        var matched = l.match(hostmatch);
        if (!matched) return;

        // Fix ASCII escapes, such as \032 for <space>.
        var name = utils.deEscapify(matched[1]);

        // Build URL.
        var host = 'http://' + matched[3];
        if (matched[2] !== '80') {  // Add port if not default.
          host += ':' + matched[2];
        }

        // Send to frontend as we go.
        panel.port.emit('result', [name, host]);
      });
    });

    dnssd.on('close', function() {
      panel.port.emit('finish');
    });
  }

}

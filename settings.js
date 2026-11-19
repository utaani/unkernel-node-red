// This file is read by the embedded Node-RED runtime in the guest.
module.exports = {
  flowFile: 'flows.json',
  externalModules: {
    autoInstall: false,
    palette: {
      allowInstall: true,
      allowUpload: true,
    },
    modules: {
      allowInstall: false,
    },
  },
  editorTheme: {
    tours: false,
  },
};

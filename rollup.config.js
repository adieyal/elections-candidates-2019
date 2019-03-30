import nodeResolve from "rollup-plugin-node-resolve";

export default {
  input: 'src/scripts/scatter.js',
  output : {
      file: 'dist/js/main.js',
      format: 'iife',
  },
  plugins: [
    nodeResolve({
       jsnext: true
    }), 
  ],
  onwarn: function ( message ) {
    if (message.code === 'CIRCULAR_DEPENDENCY') {
      return;
    }
    console.error(message);
  },
};

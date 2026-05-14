/// <reference types="vite/client" />

declare module '*.glb' {
  const src: string;
  export default src;
}

declare module '*.glb?url' {
  const src: string;
  export default src;
}

declare module '*.exr?url' {
  const src: string;
  export default src;
}

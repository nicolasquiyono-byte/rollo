// Minimal type stub for `dom-to-image-more` (the package ships no types).
// We only use the methods listed here; expand as needed.
declare module 'dom-to-image-more' {
  interface Options {
    width?: number;
    height?: number;
    quality?: number;
    bgcolor?: string;
    cacheBust?: boolean;
    style?: Partial<CSSStyleDeclaration>;
    filter?: (node: Node) => boolean;
  }

  const domtoimage: {
    toBlob(node: Node, options?: Options): Promise<Blob>;
    toPng(node: Node, options?: Options): Promise<string>;
    toJpeg(node: Node, options?: Options): Promise<string>;
    toSvg(node: Node, options?: Options): Promise<string>;
  };

  export default domtoimage;
}

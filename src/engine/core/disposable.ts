/** Something that releases GPU, WASM, or listener resources. */

export interface Disposable {
  dispose(): void;
}

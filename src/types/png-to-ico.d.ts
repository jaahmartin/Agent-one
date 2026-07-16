declare module "png-to-ico" {
  function pngToIco(input: Buffer | Buffer[]): Promise<Buffer>;
  export = pngToIco;
}

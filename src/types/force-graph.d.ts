declare module 'force-graph' {
  interface ForceGraphInstance {
    graphData(data: { nodes: any[]; links: any[] }): ForceGraphInstance
    backgroundColor(color: string): ForceGraphInstance
    nodeColor(fn: (node: any) => string): ForceGraphInstance
    nodeRelSize(size: number): ForceGraphInstance
    nodeLabel(fn: (node: any) => string): ForceGraphInstance
    nodeCanvasObjectMode(fn: () => string): ForceGraphInstance
    nodeCanvasObject(
      fn: (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => void,
    ): ForceGraphInstance
    linkColor(fn: () => string): ForceGraphInstance
    linkWidth(width: number): ForceGraphInstance
    linkDirectionalParticles(n: number): ForceGraphInstance
    linkDirectionalParticleWidth(w: number): ForceGraphInstance
    linkDirectionalParticleColor(fn: () => string): ForceGraphInstance
    onNodeClick(fn: (node: any) => void): ForceGraphInstance
    onBackgroundClick(fn: () => void): ForceGraphInstance
    centerAt(x: number, y: number, ms?: number): ForceGraphInstance
    zoom(k: number, ms?: number): ForceGraphInstance
    autoPauseRedraw(enabled: boolean): ForceGraphInstance
    warmupTicks(ticks: number): ForceGraphInstance
    cooldownTime(ms: number): ForceGraphInstance
    width(w: number): ForceGraphInstance
    height(h: number): ForceGraphInstance
    _destructor(): void
  }
  export default function ForceGraph2D(): (element: HTMLElement) => ForceGraphInstance
}

declare module 'force-graph' {
  interface ForceGraphInstance {
    graphData(data: { nodes: any[]; links: any[] }): ForceGraphInstance
    backgroundColor(color: string): ForceGraphInstance
    nodeColor(fn: (node: any) => string): ForceGraphInstance
    nodeRelSize(size: number): ForceGraphInstance
    nodeLabel(fn: (node: any) => string): ForceGraphInstance
    nodeCanvasObjectMode(fn: () => string): ForceGraphInstance
    nodeCanvasObject(fn: (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => void): ForceGraphInstance
    linkColor(fn: () => string): ForceGraphInstance
    linkWidth(width: number): ForceGraphInstance
    warmupTicks(ticks: number): ForceGraphInstance
    cooldownTime(ms: number): ForceGraphInstance
    width(w: number): ForceGraphInstance
    height(h: number): ForceGraphInstance
    _destructor(): void
  }
  export default function ForceGraph2D(): (element: HTMLElement) => ForceGraphInstance
}

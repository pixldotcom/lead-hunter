export function PixlDotLoader({message = 'Loading Lead Hunter…'}:{message?:string}) {
  return <div className="pixldot-loading-screen" role="status" aria-live="polite">
    <div className="pixldot-loading-mark" aria-hidden="true">
      <span className="pixldot-tile"/><span className="pixldot-tile"/>
      <span className="pixldot-tile"/><span className="pixldot-dot"/>
    </div>
    <strong>LEAD HUNTER <span>V2</span></strong>
    <p>{message}</p>
  </div>;
}

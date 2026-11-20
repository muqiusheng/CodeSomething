// Port of LeiBox stacked-metadata's analytic damped spring (mass 1, stiffness 175, damping 20).
// Design reference: Gabriel https://x.com/gabriell_lab/status/2117611847805272267/video/1
// Independent LeiBox implementation; no original author code or redistribution rights claimed.
export type MetadataSpring={value:number;velocity:number;target:number};
export function advanceMetadataSpring(state:MetadataSpring,seconds:number){
 const stiffness=175,damping=20,mass=1;const decay=damping/(2*mass);const frequency=Math.sqrt(stiffness/mass-decay*decay);const offset=state.value-state.target;const envelope=Math.exp(-decay*seconds);const cos=Math.cos(frequency*seconds),sin=Math.sin(frequency*seconds);const velocity=state.velocity;
 state.value=state.target+envelope*(offset*cos+(velocity+decay*offset)/frequency*sin);
 state.velocity=envelope*(velocity*cos-(decay*velocity+stiffness*offset)/frequency*sin);
 if(Math.abs(state.value-state.target)<.0005&&Math.abs(state.velocity)<.0005){state.value=state.target;state.velocity=0}
}

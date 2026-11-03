/*!
 * Footprint Globe WebGL Surface Shader
 * Copyright (c) 2026 曾威长/Over9rowth. Released under the MIT License.
 */

/** A demand-rendered texture layer sharing D3's orthographic orientation. */
export interface EarthSurfaceView {width:number;height:number;cx:number;cy:number;radius:number;rotation:number[]}
type RotationFactory=(angles:number[])=>((point:number[])=>number[]);
export function createEarthSurface(stage:HTMLElement, assetBase?: string):{render(view:EarthSurfaceView):void;dispose():void}|null {
  const geoRotation=(window as unknown as {d3?:{geoRotation?:RotationFactory}}).d3?.geoRotation;
  if(!geoRotation)return null;
  const canvas=document.createElement('canvas');
  canvas.className='earth-surface';canvas.setAttribute('aria-hidden','true');
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:false});
  if(!gl)return null;
  let nightReady=false;
  let disposed=false,ready=false,lost=false,last:EarthSurfaceView|undefined;
  const shaders:WebGLShader[]=[];
  let program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null,texture:WebGLTexture|null=null,nightTexture:WebGLTexture|null=null;
  const clearFlag=()=>{delete stage.dataset.earthTextured;delete stage.dataset.earthNight;};
  const compile=(type:number,source:string)=>{
    const shader=gl.createShader(type);if(!shader)throw Error('Shader allocation failed');shaders.push(shader);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Shader compilation failed');return shader;
  };
  const image=new Image(),nightImage=new Image();
  const release=()=>{
    if(nightTexture)gl.deleteTexture(nightTexture);if(texture)gl.deleteTexture(texture);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);
    shaders.forEach(shader=>gl.deleteShader(shader));texture=null;buffer=null;program=null;
  };
  const dispose=()=>{
    if(disposed)return;disposed=true;ready=false;clearFlag();image.onload=null;image.onerror=null;
    nightImage.onload=null;nightImage.onerror=null;nightImage.removeAttribute('src');image.removeAttribute('src');canvas.removeEventListener('webglcontextlost',onLost);release();canvas.remove();
  };
  const onLost=(event:Event)=>{event.preventDefault();lost=true;ready=false;clearFlag();canvas.style.visibility='hidden';};
  try{
    program=gl.createProgram();if(!program)throw Error('Program allocation failed');
    gl.attachShader(program,compile(gl.VERTEX_SHADER,`attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`
      precision highp float;
      uniform vec2 size;uniform vec2 center;uniform float radius;uniform float dpr;
      uniform mat3 inverseRotation;uniform sampler2D earth;uniform sampler2D night;uniform float nightReady;
      void main(){
        vec2 pixel=vec2(gl_FragCoord.x/dpr,size.y-gl_FragCoord.y/dpr);
        vec2 p=(pixel-center)/radius;float r2=dot(p,p);float r=sqrt(r2);
        if(r>1.045)discard;
        // A directional atmosphere shares the same upper-right key light as the terrain.
        float direction=.06+.94*pow(clamp(.5+dot(normalize(p+vec2(.0001)),normalize(vec2(.50,-.86)))*.5,0.,1.),1.8);
        if(r2>1.){
          float edge=max(0.,(1.045-r)/.045);
          float halo=(pow(edge,3.)*.46+pow(edge,9.)*.44)*direction;
          gl_FragColor=vec4(.28,.57,.95,halo);return;
        }
        vec3 normal=vec3(p,sqrt(max(0.,1.-r2)));
        vec3 geographic=normalize(inverseRotation*normal);
        vec2 uv=vec2((atan(geographic.x,geographic.z)+3.14159265359)/6.28318530718,.5-asin(clamp(geographic.y,-1.,1.))/3.14159265359);
        vec3 source=texture2D(earth,uv).rgb;
        vec3 luminance=vec3(.2126,.7152,.0722);
        float brightness=dot(source,luminance);
        float land=smoothstep(.025,.13,max(source.r,source.g)-source.b*.72);
        // Local texture contrast reveals the supplied photograph, not invented elevation.
        float nearby=(dot(texture2D(earth,uv+vec2(.0015,0.)).rgb,luminance)+dot(texture2D(earth,uv-vec2(.0015,0.)).rgb,luminance))*.5;
        float detail=clamp((brightness-nearby)*.16,-.012,.012);
        float relief=clamp(pow(mix(brightness,nearby,.40),.88)+detail,0.,1.);
        vec3 terrain=mix(vec3(.14,.20,.275),vec3(.34,.425,.52),relief);
        vec3 ocean=vec3(.016,.040,.080)+source*vec3(.035,.065,.115);
        vec3 sun=normalize(vec3(.46,-.76,.64));
        float ndl=dot(normal,sun);
        float diffuse=smoothstep(-.30,.94,ndl);
        // Keep ocean depth visible in the shadow without washing out continental relief.
        vec3 color=mix(ocean*(.72+.43*diffuse),terrain*(.33+.77*diffuse),land);
        // Broad, restrained ocean reflection; it is screen lighting, not a map feature.
        vec3 halfLight=normalize(sun+vec3(0.,0.,1.));
        float reflection=pow(max(0.,dot(normal,halfLight)),30.);
        color+=vec3(.13,.25,.40)*reflection*(1.-land)*.30;
        vec3 observed=texture2D(night,uv).rgb;
        float emission=smoothstep(.095,.68,max(0.,dot(observed.rg,vec2(.55,.45))-observed.b*.4));
        float nightVisibility=.30+.70*(1.-diffuse);
        color+=vec3(.76,.83,.93)*pow(emission,.72)*.82*nightReady*nightVisibility;
        // Soft grazing-angle scatter blends the illuminated limb into the deep ocean.
        float grazing=pow(1.-normal.z,2.4);
        color+=vec3(.025,.075,.145)*grazing*direction;
        float rim=pow(1.-normal.z,3.8);
        color+=vec3(.13,.33,.62)*rim*(.12+1.12*direction);
        float thinRim=exp(-pow((r-.997)/.0035,2.));
        color+=vec3(.48,.72,.98)*thinRim*direction*.72;
        gl_FragColor=vec4(color,1.-smoothstep(.996,1.,r));
      }`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Program link failed');
    buffer=gl.createBuffer();texture=gl.createTexture();nightTexture=gl.createTexture();if(!buffer||!texture)throw Error('GPU allocation failed');
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    canvas.addEventListener('webglcontextlost',onLost);
    stage.insertBefore(canvas,stage.querySelector('#globe'));
  }catch{dispose();return null;}
  const activeProgram=program!;
  const locations={size:gl.getUniformLocation(activeProgram,'size'),center:gl.getUniformLocation(activeProgram,'center'),radius:gl.getUniformLocation(activeProgram,'radius'),dpr:gl.getUniformLocation(activeProgram,'dpr'),inverse:gl.getUniformLocation(activeProgram,'inverseRotation'),earth:gl.getUniformLocation(activeProgram,'earth'),night:gl.getUniformLocation(activeProgram,'night'),nightReady:gl.getUniformLocation(activeProgram,'nightReady')};
  const render=(view:EarthSurfaceView)=>{
    last={...view,rotation:[...view.rotation]};
    if(disposed||lost||!ready||!Number.isFinite(view.radius)||view.radius<=0||view.width<=0||view.height<=0)return;
    try{
      const dpr=Math.min(window.devicePixelRatio||1,2),width=Math.round(view.width*dpr),height=Math.round(view.height*dpr);
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      canvas.style.width=`${view.width}px`;canvas.style.height=`${view.height}px`;
      gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(activeProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const attribute=gl.getAttribLocation(activeProgram,'a');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(locations.earth,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,nightReady?nightTexture:texture);gl.uniform1i(locations.night,1);gl.uniform1f(locations.nightReady,nightReady?1:0);
      gl.uniform2f(locations.size,view.width,view.height);gl.uniform2f(locations.center,view.cx,view.cy);gl.uniform1f(locations.radius,view.radius);gl.uniform1f(locations.dpr,dpr);
      const rotate=geoRotation(view.rotation);
      const screen=(point:number[])=>{const [lon,lat]=rotate(point).map(value=>value*Math.PI/180);return [Math.cos(lat)*Math.sin(lon),-Math.sin(lat),Math.cos(lat)*Math.cos(lon)];};
      const x=screen([90,0]),y=screen([0,90]),z=screen([0,0]);
      // Transpose the orthonormal geographic-to-screen basis to invert D3 rotation.
      gl.uniformMatrix3fv(locations.inverse,false,new Float32Array([x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]]));
      gl.drawArrays(gl.TRIANGLES,0,6);
      if(gl.getError()!==gl.NO_ERROR)throw Error('Earth draw failed');
      stage.dataset.earthTextured='true';stage.dataset.earthNight=String(nightReady);
    }catch{ready=false;clearFlag();canvas.style.visibility='hidden';}
  };
  image.onload=()=>{
    if(disposed||lost)return;
    try{
      gl.bindTexture(gl.TEXTURE_2D,texture);
      // Image rows already run north-to-south, matching the equirectangular v coordinate.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(gl.getError()!==gl.NO_ERROR)throw Error('Earth texture upload failed');ready=true;if(last)render(last);
    }catch{ready=false;clearFlag();canvas.style.visibility='hidden';}
    image.onload=null;image.onerror=null;
  };
  image.onerror=()=>{ready=false;clearFlag();image.onload=null;image.onerror=null;canvas.style.visibility='hidden';};
  nightImage.onload=()=>{
    if(disposed||lost||!nightTexture)return;
    try{
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,nightTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,nightImage);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      nightReady=gl.getError()===gl.NO_ERROR;
    }catch{nightReady=false;}
    nightImage.onload=null;nightImage.onerror=null;if(ready&&last)render(last);
  };
  // This decorative historical layer is optional; day terrain remains usable on failure.
  nightImage.onerror=()=>{nightReady=false;nightImage.onload=null;nightImage.onerror=null;};
  const rawBase = assetBase || (document.documentElement.dataset.previewPrefix ?? ((import.meta as any).env?.BASE_URL || './'));
  const prefix=rawBase==='/'?'':String(rawBase).replace(/\/$/,'');
  nightImage.src=prefix+'/maps/earth/earth-night.webp';
  image.src=prefix+'/maps/earth/earth-day.webp';
  return {render,dispose};
}

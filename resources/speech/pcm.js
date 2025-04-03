/**
 * Copyright FunASR (https://github.com/alibaba-damo-academy/FunASR). All Rights
 * Reserved. MIT License  (https://opensource.org/licenses/MIT)
 */
/* 2022-2023 by zhaoming,mali aihealthx.com */

Recorder.prototype.enc_pcm={
	stable:!0,testmsg:"pcm编码器"
};

Recorder.prototype.pcm=function(res,True,False){
		var This=this,set=This.set,size=res.length,sampleRate=set.sampleRate
		,buffer=new ArrayBuffer(size*2)
		,data=new DataView(buffer);
		
		var offset=0;
		var write16=function(v){
			data.setInt16(offset,v,true);
			offset+=2;
		};
		
		for(var i=0;i<size;i++){
			var val=res[i];
			val=parseInt(0x7FFF*val);
			write16(val);
		};
		
		True(new Blob([data.buffer],{type:"audio/pcm"}));
	};
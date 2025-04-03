/**
 * Copyright FunASR (https://github.com/alibaba-damo-academy/FunASR). All Rights
 * Reserved. MIT License  (https://opensource.org/licenses/MIT)
 */
/* 2022-2023 by zhaoming,mali aihealthx.com */

Recorder.prototype.enc_wav={
	stable:!0,testmsg:"wav编码器"
};

Recorder.prototype.wav=function(res,True,False){
		var This=this,set=This.set,size=res.length,sampleRate=set.sampleRate
			
		,dataLength=size*(set.bitRate/8)
		,buffer=new ArrayBuffer(44+dataLength)
		,data=new DataView(buffer);
		
		var offset=0;
		var writeString=function(str){
			for (var i=0; i<str.length; i++,offset++) {
				data.setUint8(offset, str.charCodeAt(i));
			};
		};
		var write16=function(v){
			data.setUint16(offset,v,true);
			offset+=2;
		};
		var write32=function(v){
			data.setUint32(offset,v,true);
			offset+=4;
		};
		
		/* RIFF identifier */
		writeString('RIFF');
		/* RIFF chunk length */
		write32(36+dataLength);
		/* RIFF type */
		writeString('WAVE');
		/* format chunk identifier */
		writeString('fmt ');
		/* format chunk length */
		write32(16);
		/* sample format (raw) */
		write16(1);
		/* channel count */
		write16(1);
		/* sample rate */
		write32(sampleRate);
		/* byte rate (sample rate * block align) */
		write32(sampleRate * (set.bitRate/8));
		/* block align (channel count * bytes per sample) */
		write16(set.bitRate/8);
		/* bits per sample */
		write16(set.bitRate);
		/* data chunk identifier */
		writeString('data');
		/* data chunk length */
		write32(dataLength);
		
		// 写入采样数据
		if(set.bitRate==8){
			for(var i=0;i<size;i++,offset++){
				var val=res[i];
				val=parseInt(255/2*(val+1));
				data.setInt8(offset,val,true);
			};
		}else{
			for(var i=0;i<size;i++,offset+=2){
				var val=res[i];
				val=parseInt(0x7FFF*val);
				data.setInt16(offset,val,true);
			};
		};
		
		True(new Blob([data.buffer],{type:"audio/wav"}));
	}
	Recorder.pcm2wav=function(data,True,False){
			data.type=data.type||"pcm";
			data.sampleRate=data.sampleRate||8000;
			data.bitRate=data.bitRate||16;
		 
			if(!data.blob){
				False&&False("pcm2wav必须提供blob数据");
				return;
			};
			
			var reader=new FileReader();
			reader.onloadend=function(){
				var bytes=new Uint8Array(reader.result);
				var arr=Recorder.SampleData(bytes,1,1).data;
				var size=arr.length;
				var sampleRate=data.sampleRate,bitRate=data.bitRate;
				
				var dataLength=size*(bitRate/8);
				var buffer=new ArrayBuffer(44+dataLength);
				var data=new DataView(buffer);
				
				var offset=0;
				var writeString=function(str){
					for (var i=0; i<str.length; i++,offset++) {
						data.setUint8(offset, str.charCodeAt(i));
					};
				};
				var write16=function(v){
					data.setUint16(offset,v,true);
					offset+=2;
				};
				var write32=function(v){
					data.setUint32(offset,v,true);
					offset+=4;
				};
				
				/* RIFF identifier */
				writeString('RIFF');
				/* RIFF chunk length */
				write32(36+dataLength);
				/* RIFF type */
				writeString('WAVE');
				/* format chunk identifier */
				writeString('fmt ');
				/* format chunk length */
				write32(16);
				/* sample format (raw) */
				write16(1);
				/* channel count */
				write16(1);
				/* sample rate */
				write32(sampleRate);
				/* byte rate (sample rate * block align) */
				write32(sampleRate * (bitRate/8));
				/* block align (channel count * bytes per sample) */
				write16(bitRate/8);
				/* bits per sample */
				write16(bitRate);
				/* data chunk identifier */
				writeString('data');
				/* data chunk length */
				write32(dataLength);
				
				// 写入采样数据
				 
				if(bitRate==8){
					for(var i=0;i<size;i++,offset++){
						data.setInt8(offset,arr[i],true);
					};
				}else{
					for(var i=0;i<size;i++,offset+=2){
						data.setInt16(offset,arr[i],true);
					};
				};
				
				True(new Blob([data.buffer],{type:"audio/wav"}));
			};
			reader.readAsArrayBuffer(data.blob);
		};

//end：录音核心支持文件
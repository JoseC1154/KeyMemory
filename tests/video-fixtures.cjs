// Generated tones and a solid-color picture only. No user or downloaded media.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {SAMPLE_RATE,synthesize,melody}=require('./audio-fixtures.cjs');
function createVideoFixtures(directory=fs.mkdtempSync(path.join(os.tmpdir(),'keymemory-video-fixtures-'))){
 fs.mkdirSync(directory,{recursive:true});
 const samples=synthesize(melody,7),wav=Buffer.alloc(44+samples.length*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(SAMPLE_RATE,24);wav.writeUInt32LE(SAMPLE_RATE*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));
 const audio=path.join(directory,'generated-piano.wav');fs.writeFileSync(audio,wav);
 const ffmpeg=(args)=>execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'pipe'});
 const input=['-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=7','-i',audio];
 ffmpeg([...input,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-shortest','-movflags','+faststart',path.join(directory,'generated-piano.mp4')]);
 ffmpeg(['-i',path.join(directory,'generated-piano.mp4'),'-c','copy',path.join(directory,'generated-piano.mov')]);
 ffmpeg([...input,'-c:v','libvpx-vp9','-c:a','libopus','-b:a','48k','-shortest',path.join(directory,'generated-piano.webm')]);
 ffmpeg(['-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=2','-c:v','libx264','-pix_fmt','yuv420p','-an',path.join(directory,'no-audio.mp4')]);
 // 18-second screen-recording variants: same picture, AAC/PCM signal, missing or silent audio.
 const screenInput=['-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=18'];
 ffmpeg([...screenInput,'-stream_loop','-1','-i',audio,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-t','18','-movflags','+faststart',path.join(directory,'generated-18s-aac.mov')]);
 ffmpeg(['-i',path.join(directory,'generated-18s-aac.mov'),'-c:v','copy','-c:a','pcm_s16le',path.join(directory,'generated-18s-pcm.mov')]);
 ffmpeg([...screenInput,'-c:v','libx264','-pix_fmt','yuv420p','-an',path.join(directory,'generated-18s-no-audio.mov')]);
 ffmpeg([...screenInput,'-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-t','18',path.join(directory,'generated-18s-silent.mov')]);
 ffmpeg(['-f','lavfi','-i','testsrc2=size=1280x720:rate=30:duration=18','-stream_loop','-1','-i',audio,'-c:v','libx264','-preset','ultrafast','-threads','2','-b:v','16M','-minrate','16M','-maxrate','16M','-bufsize','16M','-x264-params','nal-hrd=cbr:filler=1','-pix_fmt','yuv420p','-c:a','aac','-t','18','-movflags','+faststart',path.join(directory,'generated-18s-large.mov')]);
 fs.writeFileSync(path.join(directory,'invalid.mp4'),'This is not a video container.');
 return directory;
}
module.exports={createVideoFixtures};
if(require.main===module)console.log(createVideoFixtures(process.argv[2]));

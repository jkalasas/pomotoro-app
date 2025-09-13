import { useEffect, useRef, useState } from "react";
import { useAppSettings } from "~/stores/settings";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Save, X } from "lucide-react";

export function meta() {
  return [{ title: "Settings - Pomotoro" }];
}

export default function SettingsPage() {
  const settings = useAppSettings();
  const [focusSound, setFocusSound] = useState(settings.focusResumeSound);
  const [waitingVideo, setWaitingVideo] = useState(settings.waitingVideo);
  const [audioFileInputKey, setAudioFileInputKey] = useState(0);
  const [videoFileInputKey, setVideoFileInputKey] = useState(0);
  const [selectedAudioName, setSelectedAudioName] = useState<string | null>(
    null
  );
  const [selectedVideoName, setSelectedVideoName] = useState<string | null>(
    null
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(
    null
  );

  useEffect(() => {
    if (!settings.isLoaded) settings.load();
  }, [settings.isLoaded]);

  useEffect(() => {
    setFocusSound(settings.focusResumeSound);
    setWaitingVideo(settings.waitingVideo);
  }, [settings.focusResumeSound, settings.waitingVideo]);

  const handleSave = async () => {
    await settings.setFocusResumeSound(focusSound);
    await settings.setWaitingVideo(waitingVideo);
    toast.success("Settings saved");
  };

  const handlePreview = () => {
    try {
      if (previewAudio) {
        previewAudio.pause();
      }
      const src = focusSound.startsWith("blob:")
        ? focusSound
        : focusSound.startsWith("/")
        ? focusSound
        : `/audio/${focusSound}`;
      const audio = new Audio(src);
      audio.play();
      setPreviewAudio(audio);
    } catch (e) {
      toast.error("Failed to play sound");
    }
  };

  const stopAudioPreview = () => {
    if (previewAudio) {
      previewAudio.pause();
      try {
        previewAudio.currentTime = 0;
      } catch {}
    }
  };

  const toggleVideoPlayback = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  return (
    <main className="flex flex-col pb-8 gap-8 p-6 min-h-screen">
      <div className="w-full flex justify-between items-center backdrop-blur-sm bg-card/60 rounded-2xl p-4 py-5.5 border border-border/50 shadow-sm">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Break Overlay</CardTitle>
          <CardDescription>
            Customize audio and video used during rest cycles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="mb-2">Focus Resume Sound</Label>
            <Select
              value={focusSound}
              onValueChange={(val) => {
                if (val === "__pick__") {
                  const el = document.getElementById(
                    "focus-audio-file"
                  ) as HTMLInputElement | null;
                  el?.click();
                  return;
                }
                setFocusSound(val);
                if (!val.startsWith("blob:")) setSelectedAudioName(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select audio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="/audio/teleleleng.mp3">
                  Default audio
                </SelectItem>
                {settings.recentFocusSounds
                  .filter((p) => p !== "/audio/teleleleng.mp3")
                  .map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                {focusSound.startsWith("blob:") && (
                  <SelectItem value={focusSound}>
                    {selectedAudioName || "Custom audio"}
                  </SelectItem>
                )}
                <SelectItem value="__pick__">
                  Select audio from your files (mp3)
                </SelectItem>
              </SelectContent>
            </Select>
            <input
              id="focus-audio-file"
              key={audioFileInputKey}
              type="file"
              accept="audio/mpeg,audio/mp3"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (!file.name.toLowerCase().endsWith(".mp3")) {
                    toast.error("Must be an mp3 file");
                    return;
                  }
                  // Create an object URL for immediate playback; store pseudo path with prefix
                  const objectUrl = URL.createObjectURL(file);
                  setFocusSound(objectUrl);
                  setSelectedAudioName(file.name);
                }
                setAudioFileInputKey((k) => k + 1);
              }}
            />
            <p className="text-xs text-muted-foreground mb-4">
              Choose default, recent, or pick an mp3 from your files (not
              persisted across restarts unless you save). Object URLs won't
              persist after reload.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFocusSound("/audio/teleleleng.mp3")}
              >
                Default
              </Button>
              <Button type="button" onClick={handlePreview}>
                Preview
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={stopAudioPreview}
              >
                Stop
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="mb-2">Waiting Video</Label>
            <Select
              value={waitingVideo}
              onValueChange={(val) => {
                if (val === "__pick_video__") {
                  const el = document.getElementById(
                    "waiting-video-file"
                  ) as HTMLInputElement | null;
                  el?.click();
                  return;
                }
                setWaitingVideo(val);
                if (!val.startsWith("blob:")) setSelectedVideoName(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select video" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="/videos/waiting.mp4">
                  Default video
                </SelectItem>
                {settings.recentWaitingVideos
                  .filter((p) => p !== "/videos/waiting.mp4")
                  .map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                {waitingVideo.startsWith("blob:") && (
                  <SelectItem value={waitingVideo}>
                    {selectedVideoName || "Custom video"}
                  </SelectItem>
                )}
                <SelectItem value="__pick_video__">
                  Select video from your files (mp4)
                </SelectItem>
              </SelectContent>
            </Select>
            <input
              id="waiting-video-file"
              key={videoFileInputKey}
              type="file"
              accept="video/mp4"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (!file.name.toLowerCase().endsWith(".mp4")) {
                    toast.error("Must be an mp4 file");
                    return;
                  }
                  const objectUrl = URL.createObjectURL(file);
                  setWaitingVideo(objectUrl);
                  setSelectedVideoName(file.name);
                }
                setVideoFileInputKey((k) => k + 1);
              }}
            />
            <p className="text-xs text-muted-foreground mb-4">
              Looping video displayed in overlay. Selecting a local file uses an
              in-memory URL until saved & app remains open.
            </p>

            <div className="mt-2">
              <video
                ref={videoRef}
                key={waitingVideo}
                src={
                  waitingVideo.startsWith("blob:")
                    ? waitingVideo
                    : waitingVideo.startsWith("/")
                    ? waitingVideo
                    : `/videos/${waitingVideo}`
                }
                className="rounded-md border w-full max-w-sm aspect-video object-cover"
                loop
                muted
                controls
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWaitingVideo("/videos/waiting.mp4")}
              >
                Default
              </Button>
              <Button type="button" onClick={toggleVideoPlayback}>
                {videoRef.current && !videoRef.current.paused
                  ? "Pause"
                  : "Play"}
              </Button>
            </div>
          </div>
          <div className="flex gap-3 items-center justify-end">
            <Button
              className="rounded-full"
              variant="outline"
              type="button"
              onClick={() => {
                setFocusSound(settings.focusResumeSound);
                setWaitingVideo(settings.waitingVideo);
              }}
            >
              <X className="mr-2" size={16} />
              Cancel
            </Button>
            <Button
              className="rounded-full"
              type="button"
              onClick={async () => {
                // Only persist if not object URLs (blob:). For object URLs user must choose again next session.
                if (focusSound.startsWith("blob:"))
                  toast.message(
                    "Local audio will not persist unless you copy it to public/audio"
                  );
                if (waitingVideo.startsWith("blob:"))
                  toast.message(
                    "Local video will not persist unless you copy it to public/videos"
                  );
                await handleSave();
                // Persist to history arrays
                if (!focusSound.startsWith("blob:"))
                  await settings.setFocusResumeSound(focusSound);
                if (!waitingVideo.startsWith("blob:"))
                  await settings.setWaitingVideo(waitingVideo);
              }}
            >
              <Save className="mr-2" size={16} />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

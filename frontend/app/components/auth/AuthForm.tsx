import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "~/stores/auth";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { toast } from "sonner";

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [registerData, setRegisterData] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    password: "",
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Read env flag to allow registration. Vite exposes env vars as strings.
  const allowRegistration = (() => {
    const v = import.meta.env.VITE_ALLOW_REGISTRATION;
    if (v === undefined || v === null) return false;
    const s = String(v).toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  })();

  // If registration is disabled, ensure we always show the login view.
  useEffect(() => {
    if (!allowRegistration) setIsLogin(true);
  }, [allowRegistration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match window
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Circle properties
    const circles = Array(5).fill(0).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: 50 + Math.random() * 100,
      speedX: (Math.random() - 0.5) * 0.8,
      speedY: (Math.random() - 0.5) * 0.8,
      opacity: 0.1 + Math.random() * 0.2,
    }));

    // Animation loop
    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      circles.forEach(circle => {
        // Move circle
        circle.x += circle.speedX;
        circle.y += circle.speedY;
        
        // Bounce off edges
        if (circle.x < 0 || circle.x > canvas.width) circle.speedX *= -1;
        if (circle.y < 0 || circle.y > canvas.height) circle.speedY *= -1;
        
        // Draw circle
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${circle.opacity})`;
        ctx.fill();
      });
      
      animationId = requestAnimationFrame(animate);
    };
    
    animate();
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const { login, register, isLoading } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(loginData.email, loginData.password);
      toast.success("Logged in successfully!");
    } catch (error) {
      toast.error("Login failed");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allowRegistration) {
      toast.error("Registration is disabled");
      return;
    }

    try {
      await register(registerData);
      toast.success("Registered successfully!");
    } catch (error) {
      toast.error("Registration failed");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-primary to-primary/60 pt-10 p-4 relative overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none" 
      />
      <Card className="w-full max-w-md shadow-lg relative z-10">
        <CardHeader>
          <CardTitle>Welcome to Pomotoro</CardTitle>
          <CardDescription>
            {isLogin ? "Sign in to your account" : "Create a new account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={loginData.email}
                  onChange={(e) =>
                    setLoginData({ ...loginData, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginData.password}
                  onChange={(e) =>
                    setLoginData({ ...loginData, password: e.target.value })
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              {allowRegistration && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setIsLogin(false)}
                >
                  Don't have an account? Register
                </Button>
              )}
            </form>
          ) : (
      // Registration form
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first-name">First Name</Label>
                  <Input
                    id="first-name"
                    value={registerData.first_name}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, first_name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last Name</Label>
                  <Input
                    id="last-name"
                    value={registerData.last_name}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, last_name: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="middle-name">Middle Name (Optional)</Label>
                <Input
                  id="middle-name"
                  value={registerData.middle_name}
                  onChange={(e) =>
                    setRegisterData({ ...registerData, middle_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  value={registerData.email}
                  onChange={(e) =>
                    setRegisterData({ ...registerData, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Password</Label>
                <Input
                  id="register-password"
                  type="password"
                  value={registerData.password}
                  onChange={(e) =>
                    setRegisterData({ ...registerData, password: e.target.value })
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating account..." : "Create Account"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setIsLogin(true)}
              >
                Already have an account? Sign In
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

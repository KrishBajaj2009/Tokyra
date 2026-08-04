import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RadialGradientPaint;
import java.awt.RenderingHints;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.awt.geom.Ellipse2D;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import javax.swing.JFrame;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import javax.swing.Timer;

public class NeonUniverse {
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            JFrame frame = new JFrame("Neon Universe");
            frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
            frame.setResizable(false);
            frame.add(new UniversePanel());
            frame.pack();
            frame.setLocationRelativeTo(null);
            frame.setVisible(true);
        });
    }
}

class UniversePanel extends JPanel implements ActionListener {
    private static final int WIDTH = 1100;
    private static final int HEIGHT = 750;
    private static final int STAR_COUNT = 180;
    private static final int ORBITER_COUNT = 22;
    private static final int TRAIL_LENGTH = 16;

    private final Timer timer = new Timer(16, this);
    private final Random random = new Random();
    private final List<Star> stars = new ArrayList<>();
    private final List<Orbiter> orbiters = new ArrayList<>();

    private double pulse = 0;
    private double hueShift = 0;
    private boolean showHud = true;
    private boolean warpMode = false;
    private boolean paused = false;

    UniversePanel() {
        setPreferredSize(new Dimension(WIDTH, HEIGHT));
        setFocusable(true);
        setBackground(Color.BLACK);
        createScene();
        setupKeys();
        timer.start();
    }

    private void createScene() {
        stars.clear();
        orbiters.clear();

        for (int i = 0; i < STAR_COUNT; i++) {
            stars.add(new Star(random.nextInt(WIDTH), random.nextInt(HEIGHT), 1 + random.nextDouble() * 3));
        }

        for (int i = 0; i < ORBITER_COUNT; i++) {
            orbiters.add(new Orbiter(i, WIDTH / 2.0, HEIGHT / 2.0));
        }
    }

    private void setupKeys() {
        addKeyListener(new KeyAdapter() {
            @Override
            public void keyPressed(KeyEvent e) {
                int key = e.getKeyCode();

                if (key == KeyEvent.VK_SPACE) {
                    paused = !paused;
                } else if (key == KeyEvent.VK_W) {
                    warpMode = !warpMode;
                } else if (key == KeyEvent.VK_H) {
                    showHud = !showHud;
                } else if (key == KeyEvent.VK_R) {
                    createScene();
                } else if (key == KeyEvent.VK_UP) {
                    for (Orbiter orbiter : orbiters) {
                        orbiter.speedBoost += 0.0025;
                    }
                } else if (key == KeyEvent.VK_DOWN) {
                    for (Orbiter orbiter : orbiters) {
                        orbiter.speedBoost -= 0.0025;
                    }
                }
            }
        });
    }

    @Override
    public void addNotify() {
        super.addNotify();
        requestFocusInWindow();
    }

    @Override
    protected void paintComponent(Graphics g) {
        super.paintComponent(g);
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        paintBackground(g2);
        paintStars(g2);
        paintCore(g2);
        paintOrbiters(g2);

        if (showHud) {
            paintHud(g2);
        }

        g2.dispose();
    }

    private void paintBackground(Graphics2D g2) {
        Color top = warpMode ? new Color(8, 8, 20) : new Color(5, 8, 18);
        Color bottom = warpMode ? new Color(30, 5, 40) : new Color(0, 0, 0);
        g2.setPaint(new GradientPaint(0, 0, top, 0, HEIGHT, bottom));
        g2.fillRect(0, 0, WIDTH, HEIGHT);
    }

    private void paintStars(Graphics2D g2) {
        for (Star star : stars) {
            star.paint(g2, warpMode, HEIGHT / 2.0);
        }
    }

    private void paintCore(Graphics2D g2) {
        float centerX = WIDTH / 2f;
        float centerY = HEIGHT / 2f;
        float radius = warpMode ? 120f : 90f;

        float[] dist = {0f, 0.5f, 1f};
        Color[] colors = {
            new Color(255, 255, 255, 240),
            colorFromHue((float) ((hueShift * 0.8) % 1.0), 0.55f, 1f, 180),
            new Color(0, 0, 0, 0)
        };

        g2.setPaint(new RadialGradientPaint(centerX, centerY, radius, dist, colors));
        g2.fill(new Ellipse2D.Double(centerX - radius, centerY - radius, radius * 2, radius * 2));

        double halo = 120 + 20 * Math.sin(pulse * 1.7);
        g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.35f));
        g2.setColor(colorFromHue((float) ((hueShift + 0.1) % 1.0), 0.65f, 1f, 170));
        g2.setStroke(new BasicStroke(4f));
        g2.draw(new Ellipse2D.Double(centerX - halo, centerY - halo, halo * 2, halo * 2));
        g2.setComposite(AlphaComposite.SrcOver);
    }

    private void paintOrbiters(Graphics2D g2) {
        for (Orbiter orbiter : orbiters) {
            orbiter.paintTrail(g2);
        }

        for (Orbiter orbiter : orbiters) {
            orbiter.paint(g2);
        }
    }

    private void paintHud(Graphics2D g2) {
        g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.82f));
        g2.setColor(new Color(5, 8, 16, 190));
        g2.fillRoundRect(20, 20, 355, 145, 24, 24);

        g2.setComposite(AlphaComposite.SrcOver);
        g2.setColor(new Color(240, 245, 255));
        g2.setFont(new Font("Monospaced", Font.BOLD, 24));
        g2.drawString("NEON UNIVERSE", 38, 52);

        g2.setFont(new Font("Monospaced", Font.PLAIN, 15));
        g2.setColor(new Color(180, 220, 255));
        g2.drawString("[W] warp mode", 38, 84);
        g2.drawString("[SPACE] pause", 38, 108);
        g2.drawString("[R] reset scene", 38, 132);
        g2.drawString("[H] hide HUD   [UP/DOWN] speed", 38, 156);
    }

    private Color colorFromHue(float hue, float saturation, float brightness, int alpha) {
        Color base = Color.getHSBColor(hue, saturation, brightness);
        return new Color(base.getRed(), base.getGreen(), base.getBlue(), alpha);
    }

    @Override
    public void actionPerformed(ActionEvent e) {
        if (!paused) {
            pulse += warpMode ? 0.06 : 0.03;
            hueShift += warpMode ? 0.004 : 0.0018;

            for (Star star : stars) {
                star.update(warpMode, WIDTH, HEIGHT);
            }

            for (Orbiter orbiter : orbiters) {
                orbiter.update(WIDTH / 2.0, HEIGHT / 2.0, warpMode, hueShift);
            }
        }

        repaint();
    }

    class Star {
        double x;
        double y;
        double size;
        double drift;
        double sparkle;

        Star(double x, double y, double size) {
            this.x = x;
            this.y = y;
            this.size = size;
            this.drift = 0.25 + random.nextDouble() * 1.2;
            this.sparkle = random.nextDouble() * Math.PI * 2;
        }

        void update(boolean warp, int width, int height) {
            sparkle += 0.05;
            if (warp) {
                x -= drift * 3.5;
                if (x < -40) {
                    x = width + random.nextInt(120);
                    y = random.nextInt(height);
                }
            } else {
                x -= drift * 0.35;
                if (x < -10) {
                    x = width + 10;
                    y = random.nextInt(height);
                }
            }
        }

        void paint(Graphics2D g2, boolean warp, double midY) {
            float alpha = (float) (0.45 + 0.45 * Math.sin(sparkle));
            g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha));

            if (warp) {
                g2.setColor(new Color(180, 230, 255, 200));
                double tail = 18 + drift * 10;
                g2.setStroke(new BasicStroke((float) Math.max(1.2, size / 1.5)));
                g2.drawLine((int) x, (int) y, (int) (x + tail), (int) (y + (y - midY) * 0.02));
            } else {
                g2.setColor(new Color(255, 255, 255, 220));
                g2.fill(new Ellipse2D.Double(x, y, size, size));
            }

            g2.setComposite(AlphaComposite.SrcOver);
        }
    }

    class Orbiter {
        final int seed;
        final List<Point> trail = new ArrayList<>();
        double angle;
        double distance;
        double size;
        double speed;
        double wobble;
        double speedBoost;
        Color color;
        double x;
        double y;

        Orbiter(int seed, double centerX, double centerY) {
            this.seed = seed;
            this.angle = random.nextDouble() * Math.PI * 2;
            this.distance = 80 + random.nextDouble() * 240;
            this.size = 6 + random.nextDouble() * 14;
            this.speed = 0.004 + random.nextDouble() * 0.016;
            this.wobble = random.nextDouble() * Math.PI * 2;
            this.speedBoost = 0;
            update(centerX, centerY, false, 0);
        }

        void update(double centerX, double centerY, boolean warp, double hueShift) {
            wobble += 0.03;
            angle += speed + speedBoost + (warp ? 0.008 : 0);

            double dynamicDistance = distance + Math.sin(wobble + seed) * (warp ? 30 : 14);
            x = centerX + Math.cos(angle + seed * 0.1) * dynamicDistance;
            y = centerY + Math.sin(angle * 1.3 + seed * 0.15) * (dynamicDistance * 0.65);

            float hue = (float) ((hueShift + seed * 0.045) % 1.0);
            color = colorFromHue(hue, warp ? 0.7f : 0.5f, 1f, 215);

            trail.add(new Point((int) x, (int) y));
            if (trail.size() > TRAIL_LENGTH) {
                trail.remove(0);
            }
        }

        void paintTrail(Graphics2D g2) {
            for (int i = 1; i < trail.size(); i++) {
                Point p1 = trail.get(i - 1);
                Point p2 = trail.get(i);
                float alpha = i / (float) trail.size();
                g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha * 0.5f));
                g2.setColor(new Color(color.getRed(), color.getGreen(), color.getBlue(), 180));
                g2.setStroke(new BasicStroke(Math.max(1.5f, (float) size / 5)));
                g2.drawLine(p1.x, p1.y, p2.x, p2.y);
            }
            g2.setComposite(AlphaComposite.SrcOver);
        }

        void paint(Graphics2D g2) {
            double glow = size * 2.6;
            g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.25f));
            g2.setColor(color);
            g2.fill(new Ellipse2D.Double(x - glow / 2, y - glow / 2, glow, glow));

            g2.setComposite(AlphaComposite.SrcOver);
            g2.setColor(color);
            g2.fill(new Ellipse2D.Double(x - size / 2, y - size / 2, size, size));

            g2.setColor(new Color(255, 255, 255, 200));
            g2.fill(new Ellipse2D.Double(x - size / 6, y - size / 6, size / 3, size / 3));
        }
    }
}

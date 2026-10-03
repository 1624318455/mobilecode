package expo.modules.alive;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

public class AliveService extends Service {
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_MESSAGE = "message";
  private static final String CHANNEL_ID = "alive";
  private static final int NOTIF_ID = 1001;

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
    String message = intent != null ? intent.getStringExtra(EXTRA_MESSAGE) : null;

    if (title == null) {
      title = "MobileCode";
    }

    if (message == null) {
      message = "Listening";
    }

    startAsForeground(title, message);

    return START_STICKY;
  }

  private void startAsForeground(String title, String message) {
    NotificationManager manager =
        (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
          new NotificationChannel(
              CHANNEL_ID, "Background listener", NotificationManager.IMPORTANCE_LOW));
    }

    PendingIntent contentIntent = null;

    try {
      Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());

      if (launchIntent != null) {
        contentIntent =
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      }
    } catch (Exception e) {
      // No launch intent — the persistent notification simply does nothing.
    }

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .setOnlyAlertOnce(true);

    if (contentIntent != null) {
      builder.setContentIntent(contentIntent);
    }

    Notification notification = builder.build();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
          NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    } else {
      startForeground(NOTIF_ID, notification);
    }
  }

  @Override
  public void onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }
}

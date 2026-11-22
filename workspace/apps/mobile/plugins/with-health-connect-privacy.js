const fs = require('node:fs/promises');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withSettingsGradle,
} = require('@expo/config-plugins');

const rationaleAction = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const viewUsageAction = 'android.intent.action.VIEW_PERMISSION_USAGE';

function hasAction(intentFilter, name) {
  return (intentFilter.action || []).some((item) => item.$?.['android:name'] === name);
}

function plainText(markdown) {
  return markdown
    .replace(/^#+\s*/gm, '')
    .replace(/^\*\*(.*?)\*\*$/gm, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^- /gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function withHealthConnectPrivacy(config) {
  config = withSettingsGradle(config, (modConfig) => {
    const settings = modConfig.modResults.contents;
    const expoAutolinkingCall = 'ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)';
    const windowsSafeCall = 'ex.autolinkLibrariesFromCommand(["node", "--no-warnings", "--eval", "require(\'expo/bin/autolinking\')", "expo-modules-autolinking", "react-native-config", "--platform", "android", "--json"])';

    if (settings.includes(expoAutolinkingCall)) {
      modConfig.modResults.contents = settings.replace(expoAutolinkingCall, windowsSafeCall);
    }

    const expoModulesCall = 'expoAutolinking.useExpoModules()';
    const directNodeExpoModulesCall = `def expoHostOsName = System.getProperty("os.name")
try {
  // Expo's Windows helper passes require(...) through cmd without quoting its parentheses.
  System.setProperty("os.name", "Linux")
  expoAutolinking.useExpoModules()
} finally {
  System.setProperty("os.name", expoHostOsName)
}`;
    if (modConfig.modResults.contents.includes(expoModulesCall)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(expoModulesCall, directNodeExpoModulesCall);
    }
    return modConfig;
  });

  config = withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
    const appPackage = modConfig.android.package;
    const rationaleActivityName = `${appPackage}.HealthConnectPrivacyActivity`;

    mainActivity['intent-filter'] = (mainActivity['intent-filter'] || [])
      .filter((filter) => !hasAction(filter, rationaleAction));

    application.activity = application.activity || [];
    if (!application.activity.some((activity) => activity.$?.['android:name'] === rationaleActivityName)) {
      application.activity.push({
        $: {
          'android:name': '.HealthConnectPrivacyActivity',
          'android:exported': 'true',
          'android:label': 'Privacy notice',
          'android:theme': '@android:style/Theme.Material.Light.NoActionBar',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': rationaleAction } }] }],
      });
    }

    application['activity-alias'] = application['activity-alias'] || [];
    const permissionAlias = application['activity-alias'].find((alias) => (
      alias.$?.['android:name'] === 'ViewPermissionUsageActivity'
    ));
    if (permissionAlias) {
      permissionAlias.$['android:targetActivity'] = '.HealthConnectPrivacyActivity';
    } else {
      application['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.HealthConnectPrivacyActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': viewUsageAction } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        }],
      });
    }
    return modConfig;
  });

  return withDangerousMod(config, ['android', async (modConfig) => {
    const androidRoot = modConfig.modRequest.platformProjectRoot;
    const sdkDirectory = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
    if (sdkDirectory) {
      const sdkPath = sdkDirectory.replace(/\\/g, '/');
      await fs.writeFile(path.join(androidRoot, 'local.properties'), `sdk.dir=${sdkPath}\n`, 'utf8');
    }

    const gradlePropertiesPath = path.join(androidRoot, 'gradle.properties');
    const gradleProperties = await fs.readFile(gradlePropertiesPath, 'utf8');
    const memoryTunedProperties = gradleProperties
      .replace(/^org\.gradle\.jvmargs=.*$/m, 'org.gradle.jvmargs=-Xmx512m -XX:MaxMetaspaceSize=384m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:CICompilerCount=2 -Xss512k')
      .replace(/^org\.gradle\.parallel=.*$/m, 'org.gradle.parallel=false')
      .replace(/^newArchEnabled=.*$/m, 'newArchEnabled=false');
    const withWorkerLimit = /^org\.gradle\.workers\.max=/m.test(memoryTunedProperties)
      ? memoryTunedProperties.replace(/^org\.gradle\.workers\.max=.*$/m, 'org.gradle.workers.max=1')
      : `${memoryTunedProperties.trimEnd()}\norg.gradle.workers.max=1\n`;
    const withBuildConfig = /^android\.defaults\.buildfeatures\.buildconfig=/m.test(withWorkerLimit)
      ? withWorkerLimit.replace(/^android\.defaults\.buildfeatures\.buildconfig=.*$/m, 'android.defaults.buildfeatures.buildconfig=true')
      : `${withWorkerLimit.trimEnd()}\nandroid.defaults.buildfeatures.buildconfig=true\n`;
    await fs.writeFile(gradlePropertiesPath, withBuildConfig, 'utf8');

    const packageName = modConfig.android.package;
    const packageDirectory = packageName.split('.').join(path.sep);
    const sourceDirectory = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app', 'src', 'main', 'java', packageDirectory,
    );
    const noticePath = path.resolve(modConfig.modRequest.projectRoot, '../../docs/PRIVACY_POLICY.md');
    const notice = plainText(await fs.readFile(noticePath, 'utf8'));
    const source = `package ${packageName}

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class HealthConnectPrivacyActivity : Activity() {
  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(24), dp(20), dp(24), dp(16))
      setBackgroundColor(Color.rgb(247, 248, 244))
    }
    val title = TextView(this).apply {
      text = "Fitness Activity Tracker privacy notice"
      textSize = 22f
      setTextColor(Color.rgb(31, 49, 43))
      setPadding(0, 0, 0, dp(12))
    }
    val scroll = ScrollView(this)
    val content = TextView(this).apply {
      text = """${notice}"""
      textSize = 15f
      setTextColor(Color.rgb(54, 64, 59))
      setLineSpacing(dp(4).toFloat(), 1f)
      setTextIsSelectable(true)
    }
    scroll.addView(content)
    layout.addView(title)
    layout.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    layout.addView(Button(this).apply {
      text = "Close"
      setOnClickListener { finish() }
    }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      topMargin = dp(12)
      gravity = Gravity.BOTTOM
    })
    setContentView(layout)
  }
}
`;
    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.writeFile(path.join(sourceDirectory, 'HealthConnectPrivacyActivity.kt'), source, 'utf8');
    return modConfig;
  }]);
}

module.exports = withHealthConnectPrivacy;

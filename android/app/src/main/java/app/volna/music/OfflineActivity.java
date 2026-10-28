package app.volna.music;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** Нативная офлайн-медиатека: работает без интернета и играет сохранённые файлы. */
public class OfflineActivity extends Activity {
    private LibraryStore store;
    private Spinner sections;
    private ListView list;
    private TextView empty;
    private List<String> sectionNames = new ArrayList<>();
    private List<Track> currentTracks = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new LibraryStore(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#171722"));
        root.setPadding(28, 40, 28, 24);

        TextView title = new TextView(this);
        title.setText("Офлайн-медиатека");
        title.setTextSize(24);
        title.setTextColor(Color.WHITE);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Любимые треки, прослушанное и сохранённые плейлисты доступны без интернета.");
        subtitle.setTextSize(13);
        subtitle.setTextColor(Color.parseColor("#B9B5CB"));
        subtitle.setPadding(0, 8, 0, 20);
        root.addView(subtitle);

        sections = new Spinner(this);
        sections.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(sections);

        empty = new TextView(this);
        empty.setText("Здесь пока пусто. Сохраните музыку в приложении, когда есть интернет.");
        empty.setTextColor(Color.parseColor("#B9B5CB"));
        empty.setTextSize(13);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(16, 36, 16, 36);
        empty.setVisibility(View.GONE);
        root.addView(empty);

        list = new ListView(this);
        list.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        list.setBackgroundColor(Color.parseColor("#20202E"));
        root.addView(list);

        Button openSite = new Button(this);
        openSite.setText("Открыть сайт");
        openSite.setOnClickListener(v -> {
            startActivity(new android.content.Intent(this, MainActivity.class));
            finish();
        });
        root.addView(openSite);

        setContentView(root);

        list.setOnItemClickListener((AdapterView<?> parent, View view, int position, long id) -> {
            if (position < 0 || position >= currentTracks.size()) return;
            Track track = currentTracks.get(position);
            if (!track.isPlayable()) {
                Toast.makeText(this, "Нужен интернет: трек не скачан", Toast.LENGTH_SHORT).show();
                return;
            }
            PlaybackService.playQueue(this, currentTracks, position);
            Toast.makeText(this, "Играет: " + track.title, Toast.LENGTH_SHORT).show();
        });

        scanAndBuild();
    }

    private boolean hasMediaPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void scanAndBuild() {
        if (hasMediaPermission()) {
            new Thread(() -> {
                store.scanDeviceMusic();
                runOnUiThread(this::buildSections);
            }).start();
        } else if (Build.VERSION.SDK_INT >= 23) {
            String permission = Build.VERSION.SDK_INT >= 33
                    ? Manifest.permission.READ_MEDIA_AUDIO
                    : Manifest.permission.READ_EXTERNAL_STORAGE;
            requestPermissions(new String[]{permission}, 92);
            buildSections();
        } else {
            buildSections();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 92) scanAndBuild();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (store != null) buildSections();
    }

    private void buildSections() {
        sectionNames = new ArrayList<>();
        sectionNames.add("Моя медиатека");
        sectionNames.add("Любимые треки");
        sectionNames.add("Прослушанное");
        for (String name : store.playlistNames()) sectionNames.add("Плейлист: " + name);

        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, sectionNames);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        sections.setAdapter(adapter);
        sections.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                showSection(position);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
        showSection(0);
    }

    private void showSection(int position) {
        String section = sectionNames.get(position);
        if (section.equals("Моя медиатека")) currentTracks = store.getList("library");
        else if (section.equals("Любимые треки")) currentTracks = store.getList("favorites");
        else if (section.equals("Прослушанное")) currentTracks = store.getList("history");
        else currentTracks = store.getPlaylist(section.replace("Плейлист: ", ""));

        List<String> rows = new ArrayList<>();
        for (Track track : currentTracks) {
            String mark = track.localPath.isEmpty() ? "☁" : "↓";
            rows.add(mark + "  " + track.artist + " — " + track.title);
        }
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, rows) {
            @Override
            public View getView(int index, View convertView, ViewGroup parent) {
                TextView view = (TextView) super.getView(index, convertView, parent);
                view.setTextColor(Color.WHITE);
                view.setTextSize(14);
                view.setPadding(24, 22, 24, 22);
                return view;
            }
        };
        list.setAdapter(adapter);
        boolean isEmpty = rows.isEmpty();
        empty.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
        list.setVisibility(isEmpty ? View.GONE : View.VISIBLE);
    }
}

import { DeviceMonitor } from "../../components/device-monitor";
import { PageHeader } from "../../components/page-header";

export const metadata = { title: "Perangkat X105" };

export default function DevicesPage() {
  return (
    <>
      <PageHeader
        title="Perangkat dan sinkronisasi"
        description="Monitor diagnostik ADMS dipindahkan ke area admin tanpa mengubah endpoint perangkat yang sudah berjalan."
      />
      <DeviceMonitor />
    </>
  );
}
